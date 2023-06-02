// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {ISwapAdapter} from "../../interfaces/ISwapAdapter.sol";
import {ISwapRouter} from "../../dependencies/univ3/interfaces/ISwapRouter.sol";
import {BytesLib} from "../../dependencies/univ3/libraries/BytesLib.sol";
import {DataTypes} from "../../protocol/libraries/types/DataTypes.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";

contract UniswapV3SwapAdapter is ISwapAdapter {
    using BytesLib for bytes;

    uint256 private constant ADDR_SIZE = 20;
    uint256 private constant FEE_SIZE = 3;

    function getSwapInfo(bytes memory payload, bool exactInput)
        external
        pure
        returns (DataTypes.SwapInfo memory)
    {
        if (exactInput) {
            return _getExactInputParams(payload);
        } else {
            return _getExactOutputParams(payload);
        }
    }

    function swap(
        address router,
        bytes memory payload,
        bool exactInput
    ) external returns (uint256) {
        bytes4 selector = exactInput
            ? ISwapRouter.exactInput.selector
            : ISwapRouter.exactOutput.selector;
        bytes memory data = abi.encodePacked(selector, payload);
        bytes memory returnData = Address.functionCall(
            router,
            data,
            Errors.CALL_SWAP_FAILED
        );
        return abi.decode(returnData, (uint256));
    }

    function _getExactInputParams(bytes memory payload)
        internal
        pure
        returns (DataTypes.SwapInfo memory swapInfo)
    {
        ISwapRouter.ExactInputParams memory params = abi.decode(
            bytes(payload),
            (ISwapRouter.ExactInputParams)
        );

        address srcToken = params.path.toAddress(0);
        address dstToken = params.path.toAddress(
            params.path.length - ADDR_SIZE
        );

        swapInfo.srcToken = srcToken;
        swapInfo.dstToken = dstToken;
        swapInfo.maxAmountIn = params.amountIn;
        swapInfo.minAmountOut = params.amountOutMinimum;
        swapInfo.srcReceiver = address(0);
        swapInfo.dstReceiver = params.recipient;
        swapInfo.exactInput = true;
    }

    function _getExactOutputParams(bytes memory payload)
        internal
        pure
        returns (DataTypes.SwapInfo memory swapInfo)
    {
        ISwapRouter.ExactOutputParams memory params = abi.decode(
            bytes(payload),
            (ISwapRouter.ExactOutputParams)
        );

        address dstToken = params.path.toAddress(0);
        address srcToken = params.path.toAddress(
            params.path.length - ADDR_SIZE
        );

        swapInfo.srcToken = srcToken;
        swapInfo.dstToken = dstToken;
        swapInfo.maxAmountIn = params.amountInMaximum;
        swapInfo.minAmountOut = params.amountOut;
        swapInfo.srcReceiver = address(0);
        swapInfo.dstReceiver = params.recipient;
        swapInfo.exactInput = false;
    }
}
