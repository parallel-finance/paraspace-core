// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {ILiquidityNFTOracleWrapper} from "../interfaces/ILiquidityNFTOracleWrapper.sol";
import {IPoolAddressesProvider} from "../interfaces/IPoolAddressesProvider.sol";
import {IPriceOracleGetter} from "../interfaces/IPriceOracleGetter.sol";
import {IUniswapV3Factory} from "../dependencies/uniswapv3-core/interfaces/IUniswapV3Factory.sol";
import {IUniswapV3PoolState} from "../dependencies/uniswapv3-core/interfaces/pool/IUniswapV3PoolState.sol";
import {INonfungiblePositionManager} from "../dependencies/uniswapv3-periphery/interfaces/INonfungiblePositionManager.sol";
import {LiquidityAmounts} from "../dependencies/uniswapv3-periphery/libraries/LiquidityAmounts.sol";
import {TickMath} from "../dependencies/uniswapv3-core/libraries/TickMath.sol";
import {FullMath} from "../dependencies/uniswapv3-core/libraries/FullMath.sol";
import {LiquidityNFTPositionData, OnChainFeeParams, PairOracleData} from "../interfaces/ILiquidityNFTPositionInfoProvider.sol";
import {LiquidityNFTOracleWrapper} from "./LiquidityNFTOracleWrapper.sol";

contract UniswapV3OracleWrapper is LiquidityNFTOracleWrapper {
    constructor(
        address _factory,
        address _manager,
        address _addressProvider
    ) LiquidityNFTOracleWrapper(_factory, _manager, _addressProvider) {}

    function _getPoolAddress(
        address token0,
        address token1,
        uint24 fee
    ) internal view override returns (address) {
        return IUniswapV3Factory(DEX_FACTORY).getPool(token0, token1, fee);
    }

    function _getOnchainPositionData(
        uint256 tokenId
    )
        internal
        view
        override
        returns (address, LiquidityNFTPositionData memory)
    {
        (
            ,
            ,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint256 tokensOwed0,
            uint256 tokensOwed1
        ) = INonfungiblePositionManager(POSITION_MANAGER).positions(tokenId);

        address pool = IUniswapV3Factory(DEX_FACTORY).getPool(
            token0,
            token1,
            fee
        );
        (
            uint160 currentPrice,
            int24 currentTick,
            ,
            ,
            ,
            ,

        ) = IUniswapV3PoolState(pool).slot0();
        LiquidityNFTPositionData memory positionData;
        positionData.token0 = token0;
        positionData.token1 = token1;
        positionData.fee = fee;
        positionData.tickLower = tickLower;
        positionData.tickUpper = tickUpper;
        positionData.liquidity = liquidity;
        positionData.feeGrowthInside0LastX128 = feeGrowthInside0LastX128;
        positionData.feeGrowthInside1LastX128 = feeGrowthInside1LastX128;
        positionData.tokensOwed0 = tokensOwed0;
        positionData.tokensOwed1 = tokensOwed1;
        positionData.currentPrice = currentPrice;
        positionData.currentTick = currentTick;
        return (pool, positionData);
    }

    function _calculateLiquidityAmount(
        int24 tickLower,
        int24 tickUpper,
        uint160 currentPrice,
        uint128 liquidity
    )
        internal
        pure
        override
        returns (uint256 token0Amount, uint256 token1Amount)
    {
        (token0Amount, token1Amount) = LiquidityAmounts.getAmountsForLiquidity(
            currentPrice,
            TickMath.getSqrtRatioAtTick(tickLower),
            TickMath.getSqrtRatioAtTick(tickUpper),
            liquidity
        );
    }

    function _getPendingFeeAmounts(
        address pool,
        LiquidityNFTPositionData memory positionData
    )
        internal
        view
        override
        returns (uint256 token0Amount, uint256 token1Amount)
    {
        IUniswapV3PoolState poolState = IUniswapV3PoolState(pool);
        OnChainFeeParams memory feeParams;

        (
            ,
            ,
            feeParams.feeGrowthOutside0X128Lower,
            feeParams.feeGrowthOutside1X128Lower,
            ,
            ,
            ,

        ) = poolState.ticks(positionData.tickLower);
        (
            ,
            ,
            feeParams.feeGrowthOutside0X128Upper,
            feeParams.feeGrowthOutside1X128Upper,
            ,
            ,
            ,

        ) = poolState.ticks(positionData.tickUpper);

        feeParams.feeGrowthGlobal0X128 = poolState.feeGrowthGlobal0X128();
        feeParams.feeGrowthGlobal1X128 = poolState.feeGrowthGlobal1X128();

        (token0Amount, token1Amount) = _calculateTokenFee(
            positionData,
            feeParams
        );
    }
}
