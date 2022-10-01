// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

interface IUniswapV2Router01 {
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) external pure returns (uint256 amountOut);
}
