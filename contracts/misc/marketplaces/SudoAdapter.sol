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
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {ISudo} from "../../interfaces/ISudo.sol";
import {ILSSVMPair} from "../../interfaces/ILSSVMPair.sol";

/**
 * @title Sudo Adapter
 *
 * @notice Implements the NFT <=> ERC20 exchange logic via Sudoswap AMM
 */
contract SudoAdapter is IMarketplace {
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;

    constructor(IPoolAddressesProvider provider) {
        ADDRESSES_PROVIDER = provider;
    }

    function getAskOrderInfo(bytes memory params)
        external
        pure
        override
        returns (DataTypes.OrderInfo memory orderInfo)
    {
        (
            ISudo.PairSwapSpecific[] memory swapList,
            uint256 inputAmount,
            ,

        ) = abi.decode(
                params,
                (ISudo.PairSwapSpecific[], uint256, address, uint256)
            );

        require(swapList.length == 1, Errors.INVALID_MARKETPLACE_ORDER);
        require(
            swapList[0].nftIds.length == 1,
            Errors.INVALID_MARKETPLACE_ORDER
        );

        OfferItem[] memory offer = new OfferItem[](1);
        offer[0] = OfferItem(
            ItemType.ERC721,
            address(ILSSVMPair(swapList[0].pair).nft()),
            swapList[0].nftIds[0],
            1,
            1
        );
        orderInfo.offer = offer;

        ConsiderationItem[] memory consideration = new ConsiderationItem[](1);

        ItemType itemType = ItemType.NATIVE;
        address token = address(0);
        try ILSSVMPair(swapList[0].pair).token() returns (IERC20 _token) {
            token = address(_token);
            itemType = ItemType.ERC20;
        } catch {}
        consideration[0] = ConsiderationItem(
            itemType,
            token,
            0,
            inputAmount, // TODO: take minPercentageToAsk into account
            inputAmount,
            payable(address(0))
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
        bytes4 selector;
        if (value == 0) {
            selector = ISudo.swapERC20ForSpecificNFTs.selector;
        } else {
            selector = ISudo.swapETHForSpecificNFTs.selector;
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
