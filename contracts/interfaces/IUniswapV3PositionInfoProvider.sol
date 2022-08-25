// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

import "../protocol/libraries/types/DataTypes.sol";

/************
@title IUniswapV3PositionInfoProvider interface
@notice Interface for UniswapV3 Lp token position info.*/

interface IUniswapV3PositionInfoProvider {
    function getPositionBaseInfo(uint256 tokenId)
        external
        view
        returns (
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            int24 currentTick
        );

    function getLiquidityAmount(uint256 tokenId)
        external
        view
        returns (uint256 token0Amount, uint256 token1Amount);

    function getLpFeeAmount(uint256 tokenId)
        external
        view
        returns (uint256 token0Amount, uint256 token1Amount);
}
