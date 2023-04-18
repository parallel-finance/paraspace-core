// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {ISwapAdapter} from "../../interfaces/ISwapAdapter.sol";
import {ISwapRouter} from "../../dependencies/univ3/interfaces/ISwapRouter.sol";
import {BytesLib} from "../../dependencies/univ3/libraries/BytesLib.sol";
import {DataTypes} from "../../protocol/libraries/types/DataTypes.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";

contract UniswapV3Adapter is ISwapAdapter {
    using BytesLib for bytes;

    uint256 private constant ADDR_SIZE = 20;
    uint256 private constant FEE_SIZE = 3;

    constructor() {}

    function getSwapInfo(bytes memory payload)
        external
        view
        returns (DataTypes.SwapInfo memory swapInfo)
    {
        ISwapRouter.ExactInputParams memory params = abi.decode(
            bytes(payload),
            (ISwapRouter.ExactInputParams)
        );

        address srcToken = abi.decode(
            params.path.slice(0, ADDR_SIZE),
            (address)
        );
        address dstToken = abi.decode(
            params.path.slice(params.path.length - ADDR_SIZE, ADDR_SIZE),
            (address)
        );

        swapInfo.srcToken = srcToken;
        swapInfo.dstToken = dstToken;
        swapInfo.amount = params.amountIn;
        swapInfo.minReturnAmount = params.amountOutMinimum;
        swapInfo.srcReceiver = address(0);
        swapInfo.dstReceiver = params.recipient;
    }

    function swap(address router, bytes memory payload)
        external
        returns (bytes memory)
    {
        bytes4 selector = ISwapRouter.exactInput.selector;
        bytes memory data = abi.encodePacked(selector, payload);
        return Address.functionCall(router, data, Errors.CALL_SWAP_FAILED);
    }
}
