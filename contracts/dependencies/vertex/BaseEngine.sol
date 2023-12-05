// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "hardhat/console.sol";

import "./common/Constants.sol";
import "./common/Errors.sol";
import "./libraries/MathHelper.sol";
import "./libraries/MathSD21x18.sol";
import "./interfaces/clearinghouse/IClearinghouse.sol";
import "./interfaces/engine/IProductEngine.sol";
import "./interfaces/IOffchainBook.sol";
import "./interfaces/IFeeCalculator.sol";
import "./interfaces/IEndpoint.sol";
import "./EndpointGated.sol";
import "./interfaces/clearinghouse/IClearinghouseState.sol";

abstract contract BaseEngine is IProductEngine, EndpointGated {
    using MathSD21x18 for int128;

    IClearinghouse internal _clearinghouse;
    IFeeCalculator internal _fees;
    uint32[] internal productIds;

    // productId => orderbook
    mapping(uint32 => IOffchainBook) public markets;

    // Whether an address can apply deltas - all orderbooks and clearinghouse is whitelisted
    mapping(address => bool) internal canApplyDeltas;

    event BalanceUpdate(uint32 productId, bytes32 subaccount);
    event ProductUpdate(uint32 productId);

    function _productUpdate(uint32 productId) internal virtual {}

    function _balanceUpdate(uint32 productId, bytes32 subaccount)
        internal
        virtual
    {}

    function checkCanApplyDeltas() internal view virtual {
        require(canApplyDeltas[msg.sender], ERR_UNAUTHORIZED);
    }

    function _initialize(
        address _clearinghouseAddr,
        address, /* _quoteAddr */
        address _endpointAddr,
        address _admin,
        address _feeAddr
    ) internal initializer {
        __Ownable_init();
        setEndpoint(_endpointAddr);
        transferOwnership(_admin);

        _clearinghouse = IClearinghouse(_clearinghouseAddr);
        _fees = IFeeCalculator(_feeAddr);

        canApplyDeltas[_endpointAddr] = true;
        canApplyDeltas[_clearinghouseAddr] = true;
    }

    function getClearinghouse() external view returns (address) {
        return address(_clearinghouse);
    }

    function getProductIds() external view returns (uint32[] memory) {
        return productIds;
    }

    function getOrderbook(uint32 productId) public view returns (address) {
        return address(markets[productId]);
    }

    function _addProductForId(
        uint32 healthGroup,
        IClearinghouseState.RiskStore memory riskStore,
        address book,
        int128 sizeIncrement,
        int128 priceIncrementX18,
        int128 minSize,
        int128 lpSpreadX18
    ) internal returns (uint32 productId) {
        require(book != address(0));
        require(
            riskStore.longWeightInitial <= riskStore.longWeightMaintenance &&
                riskStore.shortWeightInitial >=
                riskStore.shortWeightMaintenance,
            ERR_BAD_PRODUCT_CONFIG
        );

        // register product with clearinghouse
        productId = _clearinghouse.registerProductForId(
            book,
            riskStore,
            healthGroup
        );

        productIds.push(productId);
        canApplyDeltas[book] = true;

        markets[productId] = IOffchainBook(book);
        markets[productId].initialize(
            _clearinghouse,
            this,
            getEndpoint(),
            owner(),
            _fees,
            productId,
            sizeIncrement,
            priceIncrementX18,
            minSize,
            lpSpreadX18
        );

        emit AddProduct(productId);
    }
}
