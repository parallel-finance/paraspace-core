// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

interface IUniswapV2Pair {
    function getReserves()
        external
        view
        returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 blockTimestampLast
        );
}
