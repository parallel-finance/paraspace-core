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
import {LiquidityOracleLogic} from "./LiquidityOracleLogic.sol";

contract IZUMIOracleWrapper is ILiquidityNFTOracleWrapper {
    IiZiSwapFactory immutable IZUMI_FACTORY;
    ILiquidityManager immutable POSITION_MANAGER;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;

    constructor(
        address _factory,
        address _manager,
        address _addressProvider
    ) {
        IZUMI_FACTORY = IiZiSwapFactory(_factory);
        POSITION_MANAGER = ILiquidityManager(_manager);
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressProvider);
    }

    /**
     * @notice get onchain position data from uniswap for the specified tokenId.
     */
    function getOnchainPositionData(uint256 tokenId)
        external
        view
        returns (LiquidityNFTPositionData memory positionData)
    {
        (, positionData) = _getOnchainPositionData(tokenId);
    }

    function _getOnchainPositionData(uint256 tokenId)
        internal
        view
        returns (
            IiZiSwapPool pool,
            LiquidityNFTPositionData memory positionData
        )
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
        ) = POSITION_MANAGER.liquidities(tokenId);
        (
            positionData.token0,
            positionData.token1,
            positionData.fee
        ) = POSITION_MANAGER.poolMetas(poolId);

        pool = IiZiSwapPool(
            IZUMI_FACTORY.pool(
                positionData.token0,
                positionData.token1,
                positionData.fee
            )
        );
        (positionData.currentPrice, positionData.currentTick, , , , , , ) = pool
            .state();
    }

    /**
     * @notice get onchain liquidity amount for the specified tokenId.
     */
    function getLiquidityAmount(uint256 tokenId)
        external
        view
        returns (uint256 token0Amount, uint256 token1Amount)
    {
        (
            ,
            LiquidityNFTPositionData memory positionData
        ) = _getOnchainPositionData(tokenId);
        (token0Amount, token1Amount) = getLiquidityAmountFromPositionData(
            positionData
        );
    }

    /**
     * @notice calculate liquidity amount for the position data.
     * @param positionData The specified position data
     */
    function getLiquidityAmountFromPositionData(
        LiquidityNFTPositionData memory positionData
    ) public pure returns (uint256 token0Amount, uint256 token1Amount) {
        (token0Amount, token1Amount, ) = _computeDepositXY(
            positionData.liquidity,
            positionData.tickLower,
            positionData.tickUpper,
            positionData.currentTick,
            positionData.currentPrice
        );
    }

    /**
     * @notice get liquidity provider fee amount for the specified tokenId.
     */
    function getLpFeeAmount(uint256 tokenId)
        external
        view
        returns (uint256 token0Amount, uint256 token1Amount)
    {
        (
            IiZiSwapPool pool,
            LiquidityNFTPositionData memory positionData
        ) = _getOnchainPositionData(tokenId);
        (token0Amount, token1Amount) = _getLpFeeAmountFromPositionData(
            pool,
            positionData
        );
    }

    /**
     * @notice calculate liquidity provider fee amount for the position data.
     * @param positionData The specified position data
     */
    function getLpFeeAmountFromPositionData(
        LiquidityNFTPositionData memory positionData
    ) external view returns (uint256 token0Amount, uint256 token1Amount) {
        IiZiSwapPool pool = IiZiSwapPool(
            IZUMI_FACTORY.pool(
                positionData.token0,
                positionData.token1,
                positionData.fee
            )
        );
        return _getLpFeeAmountFromPositionData(pool, positionData);
    }

    function _getLpFeeAmountFromPositionData(
        IiZiSwapPool pool,
        LiquidityNFTPositionData memory positionData
    ) internal view returns (uint256 token0Amount, uint256 token1Amount) {
        (token0Amount, token1Amount) = _getPendingFeeAmounts(
            pool,
            positionData
        );

        token0Amount += positionData.tokensOwed0;
        token1Amount += positionData.tokensOwed1;
    }

    /**
     * @notice Returns the price for the specified tokenId.
     */
    function getTokenPrice(uint256 tokenId) external view returns (uint256) {
        (
            IiZiSwapPool pool,
            LiquidityNFTPositionData memory positionData
        ) = _getOnchainPositionData(tokenId);

        PairOracleData memory oracleData = LiquidityOracleLogic.getOracleData(
            IPriceOracleGetter(ADDRESSES_PROVIDER.getPriceOracle()),
            positionData
        );

        (
            uint256 liquidityAmount0,
            uint256 liquidityAmount1,

        ) = _computeDepositXY(
                positionData.liquidity,
                positionData.tickLower,
                positionData.tickUpper,
                TickMath.getTickAtSqrtRatio(oracleData.sqrtPriceX96),
                oracleData.sqrtPriceX96
            );

        (
            uint256 feeAmount0,
            uint256 feeAmount1
        ) = _getLpFeeAmountFromPositionData(pool, positionData);

        return
            (((liquidityAmount0 + feeAmount0) * oracleData.token0Price) /
                10**oracleData.token0Decimal) +
            (((liquidityAmount1 + feeAmount1) * oracleData.token1Price) /
                10**oracleData.token1Decimal);
    }

    function _getPendingFeeAmounts(
        IiZiSwapPool pool,
        LiquidityNFTPositionData memory positionData
    ) internal view returns (uint256 token0Amount, uint256 token1Amount) {
        OnChainFeeParams memory feeParams;

        (
            ,
            ,
            feeParams.feeGrowthOutside0X128Lower,
            feeParams.feeGrowthOutside1X128Lower,

        ) = pool.points(positionData.tickLower);
        (
            ,
            ,
            feeParams.feeGrowthOutside0X128Upper,
            feeParams.feeGrowthOutside1X128Upper,

        ) = pool.points(positionData.tickUpper);

        feeParams.feeGrowthGlobal0X128 = pool.feeScaleX_128();
        feeParams.feeGrowthGlobal1X128 = pool.feeScaleY_128();

        (token0Amount, token1Amount) = LiquidityOracleLogic.calculateTokenFee(
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
    )
        private
        pure
        returns (
            uint128 x,
            uint128 y,
            uint128 yc
        )
    {
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

    function _computeDepositYc(uint128 liquidDelta, uint160 sqrtPrice_96)
        private
        pure
        returns (uint128 y)
    {
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
