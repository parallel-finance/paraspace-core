// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {ILiquidityNFTOracleWrapper} from "../interfaces/ILiquidityNFTOracleWrapper.sol";
import {IPoolAddressesProvider} from "../interfaces/IPoolAddressesProvider.sol";
import {IPriceOracleGetter} from "../interfaces/IPriceOracleGetter.sol";
import {IiZiSwapFactory} from "../dependencies/izumi/izumi-swap-core/interfaces/IiZiSwapFactory.sol";
import {IiZiSwapPool} from "../dependencies/izumi/izumi-swap-core/interfaces/IiZiSwapPool.sol";
import {ILiquidityManager} from "../dependencies/izumi/izumi-swap-periphery/interfaces/ILiquidityManager.sol";
import {TickMath} from "../dependencies/uniswapv3-core/libraries/TickMath.sol";
import {LiquidityNFTPositionData, OnChainFeeParams, PairOracleData} from "../interfaces/ILiquidityNFTPositionInfoProvider.sol";
import {LogPowMath} from "../dependencies/izumi/izumi-swap-core/libraries/LogPowMath.sol";
import {AmountMath} from "../dependencies/izumi/izumi-swap-core/libraries/AmountMath.sol";
import {MulDivMath} from "../dependencies/izumi/izumi-swap-core/libraries/MulDivMath.sol";
import {TwoPower} from "../dependencies/izumi/izumi-swap-core/libraries/TwoPower.sol";
import {LiquidityNFTOracleWrapper} from "./LiquidityNFTOracleWrapper.sol";

contract IZUMIOracleWrapper is LiquidityNFTOracleWrapper {
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
        return IiZiSwapFactory(DEX_FACTORY).pool(token0, token1, fee);
    }

    function _getOnchainPositionData(
        uint256 tokenId
    )
        internal
        view
        override
        returns (address pool, LiquidityNFTPositionData memory positionData)
    {
        uint128 poolId;
        (
            positionData.tickLower,
            positionData.tickUpper,
            positionData.liquidity,
            positionData.feeGrowthInside0LastX128,
            positionData.feeGrowthInside1LastX128,
            positionData.tokensOwed0,
            positionData.tokensOwed1,
            poolId
        ) = ILiquidityManager(POSITION_MANAGER).liquidities(tokenId);
        (
            positionData.token0,
            positionData.token1,
            positionData.fee
        ) = ILiquidityManager(POSITION_MANAGER).poolMetas(poolId);

        pool = IiZiSwapFactory(DEX_FACTORY).pool(
            positionData.token0,
            positionData.token1,
            positionData.fee
        );
        (
            positionData.currentPrice,
            positionData.currentTick,
            ,
            ,
            ,
            ,
            ,

        ) = IiZiSwapPool(pool).state();
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
        (token0Amount, token1Amount, ) = _computeDepositXY(
            liquidity,
            tickLower,
            tickUpper,
            TickMath.getTickAtSqrtRatio(currentPrice),
            currentPrice
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
        IiZiSwapPool poolState = IiZiSwapPool(pool);
        OnChainFeeParams memory feeParams;

        (
            ,
            ,
            feeParams.feeGrowthOutside0X128Lower,
            feeParams.feeGrowthOutside1X128Lower,

        ) = poolState.points(positionData.tickLower);
        (
            ,
            ,
            feeParams.feeGrowthOutside0X128Upper,
            feeParams.feeGrowthOutside1X128Upper,

        ) = poolState.points(positionData.tickUpper);

        feeParams.feeGrowthGlobal0X128 = poolState.feeScaleX_128();
        feeParams.feeGrowthGlobal1X128 = poolState.feeScaleY_128();

        (token0Amount, token1Amount) = _calculateTokenFee(
            positionData,
            feeParams
        );
    }

    function _computeDepositXY(
        uint128 liquidDelta,
        int24 leftPoint,
        int24 rightPoint,
        int24 currentPoint,
        uint160 sqrtPrice_96
    ) private pure returns (uint128 x, uint128 y, uint128 yc) {
        x = 0;
        uint256 amountY = 0;
        uint160 sqrtPriceR_96 = LogPowMath.getSqrtPrice(rightPoint);
        uint160 _sqrtRate_96 = LogPowMath.getSqrtPrice(1);
        if (leftPoint < currentPoint) {
            uint160 sqrtPriceL_96 = LogPowMath.getSqrtPrice(leftPoint);
            uint256 yl;
            if (rightPoint < currentPoint) {
                yl = AmountMath.getAmountY(
                    liquidDelta,
                    sqrtPriceL_96,
                    sqrtPriceR_96,
                    _sqrtRate_96,
                    true
                );
            } else {
                yl = AmountMath.getAmountY(
                    liquidDelta,
                    sqrtPriceL_96,
                    sqrtPrice_96,
                    _sqrtRate_96,
                    true
                );
            }
            amountY += yl;
        }
        if (rightPoint > currentPoint) {
            // we need compute XR
            int24 xrLeft = (leftPoint > currentPoint)
                ? leftPoint
                : currentPoint + 1;
            uint256 xr = AmountMath.getAmountX(
                liquidDelta,
                xrLeft,
                rightPoint,
                sqrtPriceR_96,
                _sqrtRate_96,
                true
            );
            x = uint128(xr);
            require(x == xr, "XOFL");
        }
        if (leftPoint <= currentPoint && rightPoint > currentPoint) {
            // we need compute yc at point of current price
            yc = _computeDepositYc(liquidDelta, sqrtPrice_96);
            amountY += yc;
        } else {
            yc = 0;
        }
        y = uint128(amountY);
        require(y == amountY, "YOFL");
    }

    function _computeDepositYc(
        uint128 liquidDelta,
        uint160 sqrtPrice_96
    ) private pure returns (uint128 y) {
        // to simplify computation,
        // minter is required to deposit only token y in point of current price
        uint256 amount = MulDivMath.mulDivCeil(
            liquidDelta,
            sqrtPrice_96,
            TwoPower.Pow96
        );
        y = uint128(amount);
        require(y == amount, "YC OFL");
    }
}
