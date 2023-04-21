// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {ISwapAdapter} from "../../interfaces/ISwapAdapter.sol";
import {IAggregationExecutor, IOneInch} from "../../interfaces/IOneInch.sol";
import {DataTypes} from "../../protocol/libraries/types/DataTypes.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";

contract OneInchAdapter is ISwapAdapter {
    constructor() {}

    function getSwapInfo(bytes memory payload)
        external
        view
        returns (DataTypes.SwapInfo memory swapInfo)
    {
        (, IOneInch.SwapDescription memory desc, , ) = abi.decode(
            bytes(payload),
            (address, IOneInch.SwapDescription, bytes, bytes)
        );

        swapInfo.srcToken = desc.srcToken;
        swapInfo.dstToken = desc.dstToken;
        swapInfo.amount = desc.amount;
        swapInfo.minReturnAmount = desc.minReturnAmount;
        swapInfo.srcReceiver = desc.srcReceiver;
        swapInfo.dstReceiver = desc.dstReceiver;
    }

    function swap(address router, bytes memory payload)
        external
        returns (bytes memory)
    {
        bytes4 selector = IOneInch.swap.selector;
        bytes memory data = abi.encodePacked(selector, payload);
        return Address.functionCall(router, data, Errors.CALL_SWAP_FAILED);
    }
}
