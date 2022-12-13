// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {DataTypes} from "../../protocol/libraries/types/DataTypes.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import {ConsiderationItem, OfferItem, ItemType} from "../../dependencies/seaport/contracts/lib/ConsiderationStructs.sol";
import {Input} from "../../dependencies/blur-exchange/OrderStructs.sol";
import {IBlurExchange} from "../../dependencies/blur-exchange/IBlurExchange.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {IMarketplace} from "../../interfaces/IMarketplace.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";

/**
 * @title Blur Adapter
 *
 * @notice Implements the NFT <=> ERC20 exchange logic via Blur Exchange
 */
contract BlurAdapter is IMarketplace {
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    address public immutable POLICY_ALLOWED;

    constructor(IPoolAddressesProvider provider, address policyAllowed) {
        ADDRESSES_PROVIDER = provider;
        POLICY_ALLOWED = policyAllowed;
    }

    function getAskOrderInfo(bytes memory params)
        external
        view
        override
        returns (DataTypes.OrderInfo memory orderInfo)
    {
        (Input memory sell, Input memory buy) = abi.decode(
            params,
            (Input, Input)
        );
        orderInfo.maker = sell.order.trader;
        orderInfo.taker = buy.order.trader;

        require(
            sell.order.matchingPolicy == POLICY_ALLOWED, // must be StandardSaleForFixedPrice matching policy
            Errors.INVALID_MARKETPLACE_ORDER
        );
        require(
            orderInfo.taker == ADDRESSES_PROVIDER.getPool(),
            Errors.INVALID_ORDER_TAKER
        );

        OfferItem[] memory offer = new OfferItem[](1);
        offer[0] = OfferItem(
            ItemType.ERC721,
            sell.order.collection,
            sell.order.tokenId,
            1,
            1
        );
        orderInfo.offer = offer;

        ConsiderationItem[] memory consideration = new ConsiderationItem[](1);

        ItemType itemType = ItemType.ERC20;
        address token = sell.order.paymentToken;
        if (token == address(0)) {
            itemType = ItemType.NATIVE;
        }
        consideration[0] = ConsiderationItem(
            itemType,
            token,
            0,
            sell.order.price,
            sell.order.price,
            payable(buy.order.trader)
        );
        orderInfo.id = abi.encodePacked(sell.r, sell.s, sell.v);
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
        bytes4 selector = IBlurExchange.execute.selector;
        bytes memory data = abi.encodePacked(selector, params);
        return
            Address.functionCallWithValue(
                marketplace,
                data,
                value,
                Errors.CALL_MARKETPLACE_FAILED
            );
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
