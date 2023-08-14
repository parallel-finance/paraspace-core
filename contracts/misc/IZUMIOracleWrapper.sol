// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {ILiquidityNFTOracleWrapper} from "../interfaces/ILiquidityNFTOracleWrapper.sol";
import {IPoolAddressesProvider} from "../interfaces/IPoolAddressesProvider.sol";
import {IPriceOracleGetter} from "../interfaces/IPriceOracleGetter.sol";
import {IiZiSwapFactory} from "../dependencies/izumi/izumi-swap-core/interfaces/IiZiSwapFactory.sol";
import {IiZiSwapPool} from "../dependencies/izumi/izumi-swap-core/interfaces/IiZiSwapPool.sol";
import {ILiquidityManager} from "../dependencies/izumi/izumi-swap-periphery/interfaces/ILiquidityManager.sol";
import {LiquidityAmounts} from "../dependencies/uniswapv3-periphery/libraries/LiquidityAmounts.sol";
import {TickMath} from "../dependencies/uniswapv3-core/libraries/TickMath.sol";
import {SqrtLib} from "../dependencies/math/SqrtLib.sol";
import {FullMath} from "../dependencies/uniswapv3-core/libraries/FullMath.sol";
import {IERC20Detailed} from "../dependencies/openzeppelin/contracts/IERC20Detailed.sol";
import {LiquidityNFTPositionData} from "../interfaces/ILiquidityNFTPositionInfoProvider.sol";
import {SafeCast} from "../dependencies/uniswapv3-core/libraries/SafeCast.sol";
import {FixedPoint96} from "../dependencies/uniswapv3-core/libraries/FixedPoint96.sol";
import {LogPowMath} from "../dependencies/izumi/izumi-swap-core/libraries/LogPowMath.sol";
import {AmountMath} from "../dependencies/izumi/izumi-swap-core/libraries/AmountMath.sol";
import {MulDivMath} from "../dependencies/izumi/izumi-swap-core/libraries/MulDivMath.sol";
import {TwoPower} from "../dependencies/izumi/izumi-swap-core/libraries/TwoPower.sol";
import "hardhat/console.sol";

contract IZUMIOracleWrapper is ILiquidityNFTOracleWrapper {
    using SafeCast for uint256;

    IiZiSwapFactory immutable IZUMI_FACTORY;
    ILiquidityManager immutable POSITION_MANAGER;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    uint256 internal constant Q128 = 0x100000000000000000000000000000000;

    constructor(
        address _factory,
        address _manager,
        address _addressProvider
    ) {
        IZUMI_FACTORY = IiZiSwapFactory(_factory);
        POSITION_MANAGER = ILiquidityManager(_manager);
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressProvider);
    }

    struct FeeParams {
        uint256 feeGrowthOutside0X128Lower;
        uint256 feeGrowthOutside1X128Lower;
        uint256 feeGrowthOutside0X128Upper;
        uint256 feeGrowthOutside1X128Upper;
    }

    struct PairOracleData {
        uint256 token0Price;
        uint256 token1Price;
        uint8 token0Decimal;
        uint8 token1Decimal;
        uint160 sqrtPriceX96;
    }

    /**
     * @notice get onchain position data from uniswap for the specified tokenId.
     */
    function getOnchainPositionData(uint256 tokenId)
        public
        view
        returns (LiquidityNFTPositionData memory)
    {
        (
            int24 leftPt,
            int24 rightPt,
            uint128 liquidity,
            uint256 lastFeeScaleX_128,
            uint256 lastFeeScaleY_128,
            uint256 remainTokenX,
            uint256 remainTokenY,
            uint128 poolId
        ) = POSITION_MANAGER.liquidities(tokenId);
        (address token0, address token1, uint24 fee) = POSITION_MANAGER
            .poolMetas(poolId);

        IiZiSwapPool pool = IiZiSwapPool(
            IZUMI_FACTORY.pool(token0, token1, fee)
        );
        (uint160 currentPrice, int24 currentTick, , , , , , ) = pool.state();

        return
            LiquidityNFTPositionData({
                token0: token0,
                token1: token1,
                fee: fee,
                tickLower: leftPt,
                tickUpper: rightPt,
                currentTick: currentTick,
                currentPrice: currentPrice,
                liquidity: liquidity,
                feeGrowthInside0LastX128: lastFeeScaleX_128,
                feeGrowthInside1LastX128: lastFeeScaleY_128,
                tokensOwed0: remainTokenX,
                tokensOwed1: remainTokenY
            });
    }

    /**
     * @notice get onchain liquidity amount for the specified tokenId.
     */
    function getLiquidityAmount(uint256 tokenId)
        external
        view
        returns (uint256 token0Amount, uint256 token1Amount)
    {
        LiquidityNFTPositionData memory positionData = getOnchainPositionData(
            tokenId
        );
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
        LiquidityNFTPositionData memory positionData = getOnchainPositionData(
            tokenId
        );
        (token0Amount, token1Amount) = getLpFeeAmountFromPositionData(
            positionData
        );
    }

    /**
     * @notice calculate liquidity provider fee amount for the position data.
     * @param positionData The specified position data
     */
    function getLpFeeAmountFromPositionData(
        LiquidityNFTPositionData memory positionData
    ) public view returns (uint256 token0Amount, uint256 token1Amount) {
        (token0Amount, token1Amount) = _getPendingFeeAmounts(positionData);

        token0Amount += positionData.tokensOwed0;
        token1Amount += positionData.tokensOwed1;
    }

    /**
     * @notice Returns the price for the specified tokenId.
     */
    function getTokenPrice(uint256 tokenId) public view returns (uint256) {
        LiquidityNFTPositionData memory positionData = getOnchainPositionData(
            tokenId
        );

        PairOracleData memory oracleData = _getOracleData(positionData);

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
        ) = getLpFeeAmountFromPositionData(positionData);

        return
            (((liquidityAmount0 + feeAmount0) * oracleData.token0Price) /
                10**oracleData.token0Decimal) +
            (((liquidityAmount1 + feeAmount1) * oracleData.token1Price) /
                10**oracleData.token1Decimal);
    }

    function _getOracleData(LiquidityNFTPositionData memory positionData)
        internal
        view
        returns (PairOracleData memory)
    {
        PairOracleData memory oracleData;
        IPriceOracleGetter oracle = IPriceOracleGetter(
            ADDRESSES_PROVIDER.getPriceOracle()
        );
        oracleData.token0Price = oracle.getAssetPrice(positionData.token0);
        oracleData.token1Price = oracle.getAssetPrice(positionData.token1);

        oracleData.token0Decimal = IERC20Detailed(positionData.token0)
            .decimals();
        oracleData.token1Decimal = IERC20Detailed(positionData.token1)
            .decimals();

        oracleData.sqrtPriceX96 = ((SqrtLib.sqrt(
            ((oracleData.token0Price *
                10 **
                    (36 +
                        oracleData.token1Decimal -
                        oracleData.token0Decimal)) / (oracleData.token1Price))
        ) << FixedPoint96.RESOLUTION) / 1E18).toUint160();

        return oracleData;
    }

    function _getPendingFeeAmounts(LiquidityNFTPositionData memory positionData)
        internal
        view
        returns (uint256 token0Amount, uint256 token1Amount)
    {
        IiZiSwapPool pool = IiZiSwapPool(
            IZUMI_FACTORY.pool(
                positionData.token0,
                positionData.token1,
                positionData.fee
            )
        );
        FeeParams memory feeParams;

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

        uint256 feeGrowthGlobal0X128 = pool.feeScaleX_128();
        uint256 feeGrowthGlobal1X128 = pool.feeScaleY_128();

        unchecked {
            // calculate fee growth below
            uint256 feeGrowthBelow0X128;
            uint256 feeGrowthBelow1X128;
            if (positionData.currentTick >= positionData.tickLower) {
                feeGrowthBelow0X128 = feeParams.feeGrowthOutside0X128Lower;
                feeGrowthBelow1X128 = feeParams.feeGrowthOutside1X128Lower;
            } else {
                feeGrowthBelow0X128 =
                    feeGrowthGlobal0X128 -
                    feeParams.feeGrowthOutside0X128Lower;
                feeGrowthBelow1X128 =
                    feeGrowthGlobal1X128 -
                    feeParams.feeGrowthOutside1X128Lower;
            }

            // calculate fee growth above
            uint256 feeGrowthAbove0X128;
            uint256 feeGrowthAbove1X128;
            if (positionData.currentTick < positionData.tickUpper) {
                feeGrowthAbove0X128 = feeParams.feeGrowthOutside0X128Upper;
                feeGrowthAbove1X128 = feeParams.feeGrowthOutside1X128Upper;
            } else {
                feeGrowthAbove0X128 =
                    feeGrowthGlobal0X128 -
                    feeParams.feeGrowthOutside0X128Upper;
                feeGrowthAbove1X128 =
                    feeGrowthGlobal1X128 -
                    feeParams.feeGrowthOutside1X128Upper;
            }
            uint256 feeGrowthInside0X128;
            uint256 feeGrowthInside1X128;

            feeGrowthInside0X128 =
                feeGrowthGlobal0X128 -
                feeGrowthBelow0X128 -
                feeGrowthAbove0X128;
            feeGrowthInside1X128 =
                feeGrowthGlobal1X128 -
                feeGrowthBelow1X128 -
                feeGrowthAbove1X128;

            token0Amount = uint128(
                FullMath.mulDiv(
                    feeGrowthInside0X128 -
                        positionData.feeGrowthInside0LastX128,
                    positionData.liquidity,
                    Q128
                )
            );

            token1Amount = uint128(
                FullMath.mulDiv(
                    feeGrowthInside1X128 -
                        positionData.feeGrowthInside1LastX128,
                    positionData.liquidity,
                    Q128
                )
            );
        }
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
