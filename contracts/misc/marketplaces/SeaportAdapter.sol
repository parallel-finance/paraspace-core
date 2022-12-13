// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {DataTypes} from "../../protocol/libraries/types/DataTypes.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import {SeaportInterface} from "../../dependencies/seaport/contracts/interfaces/SeaportInterface.sol";
import {ConsiderationItem} from "../../dependencies/seaport/contracts/lib/ConsiderationStructs.sol";
import {AdvancedOrder, ConsiderationItem, CriteriaResolver, Fulfillment, OfferItem, ItemType} from "../../dependencies/seaport/contracts/lib/ConsiderationStructs.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {IMarketplace} from "../../interfaces/IMarketplace.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";

/**
 * @title Seaport Adapter
 *
 * @notice Implements the NFT <=> ERC20 exchange logic via OpenSea Seaport marketplace
 */
contract SeaportAdapter is IMarketplace {
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;

    constructor(IPoolAddressesProvider provider) {
        ADDRESSES_PROVIDER = provider;
    }

    function getAskOrderInfo(bytes memory params)
        external
        view
        override
        returns (DataTypes.OrderInfo memory orderInfo)
    {
        (
            AdvancedOrder memory advancedOrder,
            CriteriaResolver[] memory resolvers,
            ,
            address recipient
        ) = abi.decode(
                params,
                (AdvancedOrder, CriteriaResolver[], bytes32, address)
            );
        // support advanced order in the future
        require(
            // NOT criteria based and must be basic order
            resolvers.length == 0 && isBasicOrder(advancedOrder),
            Errors.INVALID_MARKETPLACE_ORDER
        );
        // the person who listed NFT to sell
        orderInfo.maker = advancedOrder.parameters.offerer;
        require(
            recipient == ADDRESSES_PROVIDER.getPool(),
            Errors.INVALID_ORDER_TAKER
        );

        orderInfo.id = advancedOrder.signature;
        // NFT, items will be checked inside MarketplaceLogic
        orderInfo.offer = advancedOrder.parameters.offer;
        require(orderInfo.offer.length > 0, Errors.INVALID_MARKETPLACE_ORDER);
        // ERC20, items will be checked inside MarketplaceLogic
        orderInfo.consideration = advancedOrder.parameters.consideration;
        require(
            orderInfo.consideration.length > 0,
            Errors.INVALID_MARKETPLACE_ORDER
        );
    }

    function getBidOrderInfo(bytes memory params)
        external
        pure
        override
        returns (DataTypes.OrderInfo memory orderInfo)
    {
        (AdvancedOrder[] memory advancedOrders, , ) = abi.decode(
            params,
            (AdvancedOrder[], CriteriaResolver[], Fulfillment[])
        );
        // support advanced order in the future
        require(
            // NOT criteria based and must be basic order
            advancedOrders.length == 2 &&
                isBasicOrder(advancedOrders[0]) &&
                isBasicOrder(advancedOrders[1]),
            Errors.INVALID_MARKETPLACE_ORDER
        );
        // the person who sends bid to buy NFT
        orderInfo.maker = advancedOrders[0].parameters.offerer;
        // the person who accepts bid to sell NFT
        orderInfo.taker = advancedOrders[1].parameters.offerer;
        // maker & taker must be different addresses
        require(orderInfo.maker != orderInfo.taker, Errors.MAKER_SAME_AS_TAKER);

        orderInfo.id = advancedOrders[0].signature;

        // NFT, items will be checked inside MarketplaceLogic
        orderInfo.offer = advancedOrders[1].parameters.offer;
        require(orderInfo.offer.length > 0, Errors.INVALID_MARKETPLACE_ORDER);
        // ERC20, items will be checked inside MarketplaceLogic
        orderInfo.consideration = advancedOrders[1].parameters.consideration;
        require(
            orderInfo.consideration.length > 0,
            Errors.INVALID_MARKETPLACE_ORDER
        );
    }

    function matchAskWithTakerBid(
        address marketplace,
        bytes calldata params,
        uint256 value
    ) external payable override returns (bytes memory) {
        bytes4 selector = SeaportInterface.fulfillAdvancedOrder.selector;
        bytes memory data = abi.encodePacked(selector, params);
        return
            Address.functionCallWithValue(
                marketplace,
                data,
                value,
                Errors.CALL_MARKETPLACE_FAILED
            );
    }

    function matchBidWithTakerAsk(address marketplace, bytes calldata params)
        external
        override
        returns (bytes memory)
    {
        bytes4 selector = SeaportInterface.matchAdvancedOrders.selector;
        bytes memory data = abi.encodePacked(selector, params);
        return
            Address.functionCall(
                marketplace,
                data,
                Errors.CALL_MARKETPLACE_FAILED
            );
    }

    function isBasicOrder(AdvancedOrder memory advancedOrder)
        private
        pure
        returns (bool)
    {
        return
            // FULL_OPEN || FULL_RESTRICTED
            (uint256(advancedOrder.parameters.orderType) == 0 ||
                uint256(advancedOrder.parameters.orderType) == 2) &&
            // NOT PARTIAL_FULFILLABLE
            advancedOrder.numerator == 1 &&
            advancedOrder.denominator == 1 &&
            // NO ZONE
            advancedOrder.extraData.length == 0;
    }
}
