// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {ILiquidityNFTOracleWrapper} from "../interfaces/ILiquidityNFTOracleWrapper.sol";
import {IPriceOracleGetter} from "../interfaces/IPriceOracleGetter.sol";
import {SqrtLib} from "../dependencies/math/SqrtLib.sol";
import {FullMath} from "../dependencies/uniswapv3-core/libraries/FullMath.sol";
import {IERC20Detailed} from "../dependencies/openzeppelin/contracts/IERC20Detailed.sol";
import {LiquidityNFTPositionData, OnChainFeeParams, PairOracleData} from "../interfaces/ILiquidityNFTPositionInfoProvider.sol";
import {SafeCast} from "../dependencies/uniswapv3-core/libraries/SafeCast.sol";
import {FixedPoint96} from "../dependencies/uniswapv3-core/libraries/FixedPoint96.sol";

library LiquidityOracleLogic {
    uint256 internal constant Q128 = 0x100000000000000000000000000000000;
    using SafeCast for uint256;

    function getOracleData(
        IPriceOracleGetter oracle,
        LiquidityNFTPositionData memory positionData
    ) internal view returns (PairOracleData memory) {
        PairOracleData memory oracleData;
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

    function calculateTokenFee(
        LiquidityNFTPositionData memory positionData,
        OnChainFeeParams memory feeParams
    ) internal pure returns (uint256 token0Amount, uint256 token1Amount) {
        unchecked {
            // calculate fee growth below
            uint256 feeGrowthBelow0X128;
            uint256 feeGrowthBelow1X128;
            if (positionData.currentTick >= positionData.tickLower) {
                feeGrowthBelow0X128 = feeParams.feeGrowthOutside0X128Lower;
                feeGrowthBelow1X128 = feeParams.feeGrowthOutside1X128Lower;
            } else {
                feeGrowthBelow0X128 =
                    feeParams.feeGrowthGlobal0X128 -
                    feeParams.feeGrowthOutside0X128Lower;
                feeGrowthBelow1X128 =
                    feeParams.feeGrowthGlobal1X128 -
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
                    feeParams.feeGrowthGlobal0X128 -
                    feeParams.feeGrowthOutside0X128Upper;
                feeGrowthAbove1X128 =
                    feeParams.feeGrowthGlobal1X128 -
                    feeParams.feeGrowthOutside1X128Upper;
            }
            uint256 feeGrowthInside0X128;
            uint256 feeGrowthInside1X128;

            feeGrowthInside0X128 =
                feeParams.feeGrowthGlobal0X128 -
                feeGrowthBelow0X128 -
                feeGrowthAbove0X128;
            feeGrowthInside1X128 =
                feeParams.feeGrowthGlobal1X128 -
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
}
