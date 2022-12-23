// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {DataTypes} from "../../protocol/libraries/types/DataTypes.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import {ICryptoPunk} from "../../mocks/tokens/WrappedPunk/ICryptoPunk.sol";
import {ConsiderationItem, OfferItem, ItemType} from "../../dependencies/seaport/contracts/lib/ConsiderationStructs.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {IMarketplace} from "../../interfaces/IMarketplace.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {IWrappedPunks} from "../../misc/interfaces/IWrappedPunks.sol";

/**
 * @title Punks Adapter
 *
 * @notice Implements the NFT <=> ERC20 exchange logic via CryptoPunksMarket
 */
contract PunksAdapter is IMarketplace {
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    ICryptoPunk public immutable CRYPTO_PUNKS_MARKET;
    IWrappedPunks public immutable WRAPPED_PUNKS;
    address public WPUNKS_PROXY;

    constructor(
        IPoolAddressesProvider provider,
        ICryptoPunk cryptopunks,
        IWrappedPunks wpunks
    ) {
        ADDRESSES_PROVIDER = provider;
        CRYPTO_PUNKS_MARKET = cryptopunks;
        WRAPPED_PUNKS = wpunks;
        WPUNKS_PROXY = address(0);
    }

    function getAskOrderInfo(bytes memory params)
        external
        view
        override
        returns (DataTypes.OrderInfo memory orderInfo)
    {
        (uint256 punkIndex, uint256 price) = abi.decode(
            params,
            (uint256, uint256)
        );

        ICryptoPunk.Offer memory punkOffer = CRYPTO_PUNKS_MARKET
            .punksOfferedForSale(punkIndex);

        require(punkOffer.isForSale, Errors.INVALID_MARKETPLACE_ORDER); // listed for sell
        require(
            punkOffer.onlySellTo == address(0),
            Errors.INVALID_MARKETPLACE_ORDER
        ); // sell to everyone

        OfferItem[] memory offer = new OfferItem[](1);
        offer[0] = OfferItem(
            ItemType.ERC721,
            address(WRAPPED_PUNKS),
            punkIndex,
            1,
            1
        );
        orderInfo.offer = offer;

        ConsiderationItem[] memory consideration = new ConsiderationItem[](1);

        ItemType itemType = ItemType.NATIVE;
        address token = address(0); // ETH for payment
        consideration[0] = ConsiderationItem(
            itemType,
            token,
            0,
            price,
            price,
            payable(punkOffer.seller)
        );
        orderInfo.consideration = consideration;
    }

    function getBidOrderInfo(bytes memory)
        external
        pure
        override
        returns (DataTypes.OrderInfo memory)
    {
        revert(Errors.CALL_MARKETPLACE_FAILED);
    }

    function matchAskWithTakerBid(
        address marketplace,
        bytes calldata params,
        uint256 value
    ) external payable override returns (bytes memory) {
        uint256 punkIndex = abi.decode(params, (uint256));
        bytes4 selector = ICryptoPunk.buyPunk.selector;
        bytes memory data = abi.encodePacked(selector, params);
        bytes memory result = Address.functionCallWithValue(
            marketplace,
            data,
            value,
            Errors.CALL_MARKETPLACE_FAILED
        );
        if (WPUNKS_PROXY == address(0)) {
            WRAPPED_PUNKS.registerProxy();
            WPUNKS_PROXY = WRAPPED_PUNKS.proxyInfo(address(this));
        }
        CRYPTO_PUNKS_MARKET.transferPunk(WPUNKS_PROXY, punkIndex);
        WRAPPED_PUNKS.mint(punkIndex);
        return result;
    }

    function matchBidWithTakerAsk(address, bytes calldata)
        external
        pure
        override
        returns (bytes memory)
    {
        revert(Errors.CALL_MARKETPLACE_FAILED);
    }
}
