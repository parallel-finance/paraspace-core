// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {DataTypes} from "../../protocol/libraries/types/DataTypes.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import {OrderTypes} from "../../dependencies/looksrare/contracts/libraries/OrderTypes.sol";
import {SeaportInterface} from "../../dependencies/seaport/contracts/interfaces/SeaportInterface.sol";
import {ILooksRareExchange} from "../../dependencies/looksrare/contracts/interfaces/ILooksRareExchange.sol";
import {SignatureChecker} from "../../dependencies/looksrare/contracts/libraries/SignatureChecker.sol";
import {ConsiderationItem} from "../../dependencies/seaport/contracts/lib/ConsiderationStructs.sol";
import {AdvancedOrder, CriteriaResolver, Fulfillment, OfferItem, ItemType} from "../../dependencies/seaport/contracts/lib/ConsiderationStructs.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {IERC1271} from "../../dependencies/openzeppelin/contracts/IERC1271.sol";
import {IMarketplace} from "../../interfaces/IMarketplace.sol";
import {PoolStorage} from "../../protocol/pool/PoolStorage.sol";

/**
 * @title LooksRare Adapter
 *
 * @notice Implements the NFT <=> ERC20 exchange logic via LooksRare marketplace
 */
contract LooksRareAdapter is IMarketplace {
    constructor() {}

    function getAskOrderInfo(bytes memory params, address weth)
        external
        pure
        override
        returns (DataTypes.OrderInfo memory orderInfo)
    {
        (
            OrderTypes.TakerOrder memory takerBid,
            OrderTypes.MakerOrder memory makerAsk
        ) = abi.decode(params, (OrderTypes.TakerOrder, OrderTypes.MakerOrder));
        orderInfo.maker = makerAsk.signer;

        OfferItem[] memory offer = new OfferItem[](1);
        offer[0] = OfferItem(
            ItemType.ERC721,
            makerAsk.collection,
            makerAsk.tokenId,
            1,
            1
        );
        orderInfo.offer = offer;

        ConsiderationItem[] memory consideration = new ConsiderationItem[](1);

        ItemType itemType = ItemType.ERC20;
        address token = makerAsk.currency;
        if (token == weth) {
            itemType = ItemType.NATIVE;
            token = address(0);
        }
        consideration[0] = ConsiderationItem(
            itemType,
            token,
            0,
            makerAsk.price, // TODO: take minPercentageToAsk into account
            makerAsk.price,
            payable(takerBid.taker)
        );
        orderInfo.id = abi.encodePacked(makerAsk.r, makerAsk.s, makerAsk.v);
        orderInfo.consideration = consideration;
    }

    function getBidOrderInfo(
        bytes memory /*params*/
    ) external pure override returns (DataTypes.OrderInfo memory) {
        revert(Errors.CALL_MARKETPLACE_FAILED);
    }

    function matchAskWithTakerBid(
        address marketplace,
        bytes calldata params,
        uint256 value
    ) external payable override returns (bytes memory) {
        bytes4 selector;
        if (value == 0) {
            selector = ILooksRareExchange.matchAskWithTakerBid.selector;
        } else {
            selector = ILooksRareExchange
                .matchAskWithTakerBidUsingETHAndWETH
                .selector;
        }
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
