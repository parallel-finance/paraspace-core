// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB)
        external
        view
        returns (address pair);
}
