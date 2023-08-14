// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

struct LiquidityNFTPositionData {
    address token0;
    address token1;
    uint24 fee;
    int24 tickLower;
    int24 tickUpper;
    int24 currentTick;
    uint160 currentPrice;
    uint128 liquidity;
    uint256 feeGrowthInside0LastX128;
    uint256 feeGrowthInside1LastX128;
    uint256 tokensOwed0;
    uint256 tokensOwed1;
}

/************
@title IUniswapV3PositionInfoProvider interface
@notice Interface for UniswapV3 Lp token position info.*/

interface ILiquidityNFTPositionInfoProvider {
    function getOnchainPositionData(uint256 tokenId)
        external
        view
        returns (LiquidityNFTPositionData memory);

    function getLiquidityAmountFromPositionData(
        LiquidityNFTPositionData memory positionData
    ) external view returns (uint256 token0Amount, uint256 token1Amount);

    function getLpFeeAmountFromPositionData(
        LiquidityNFTPositionData memory positionData
    ) external view returns (uint256 token0Amount, uint256 token1Amount);
}
