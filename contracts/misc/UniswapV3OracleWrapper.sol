// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IAtomicPriceAggregator} from "../interfaces/IAtomicPriceAggregator.sol";
import {IParaSpaceOracle} from "../interfaces/IParaSpaceOracle.sol";
import {IUniswapV3Factory} from "../dependencies/uniswap/IUniswapV3Factory.sol";
import {IUniswapV3PoolState} from "../dependencies/uniswap/IUniswapV3PoolState.sol";
import {INonfungiblePositionManager} from "../dependencies/uniswap/INonfungiblePositionManager.sol";
import {LiquidityAmounts} from "../dependencies/uniswap/LiquidityAmounts.sol";
import {TickMath} from "../dependencies/uniswap/libraries/TickMath.sol";
import {SqrtLib} from "../dependencies/math/SqrtLib.sol";
import {IERC20Detailed} from "../dependencies/openzeppelin/contracts/IERC20Detailed.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

contract UniswapV3OracleWrapper is IAtomicPriceAggregator {
    IUniswapV3Factory immutable UNISWAP_V3_FACTORY;
    INonfungiblePositionManager immutable UNISWAP_V3_POSITION_MANAGER;
    IParaSpaceOracle immutable PARASPACE_ORACLE;
    uint256 internal constant Q128 = 0x100000000000000000000000000000000;

    constructor(
        address _factory,
        address _manager,
        address _oracle
    ) {
        UNISWAP_V3_FACTORY = IUniswapV3Factory(_factory);
        UNISWAP_V3_POSITION_MANAGER = INonfungiblePositionManager(_manager);
        PARASPACE_ORACLE = IParaSpaceOracle(_oracle);
    }

    struct FeeParams {
        uint256 faTokenA;
        uint256 fbTokenA;
        uint256 faTokenB;
        uint256 fbTokenB;
        uint256 feeGrowthOutside0X128Lower;
        uint256 feeGrowthOutside1X128Lower;
        uint256 feeGrowthOutside0X128Upper;
        uint256 feeGrowthOutside1X128Upper;
        uint256 unclaimedTokenAFee;
        uint256 unclaimedTokenBFee;
    }

    // get token price
    function getTokenPrice(uint256 tokenId) public view returns (uint256) {
        DataTypes.UinswapV3PositionData memory positionData;

        (
            ,
            ,
            positionData.tokenA,
            positionData.tokenB,
            positionData.fee,
            positionData.tickLower,
            positionData.tickUpper,
            positionData.liquidity,
            positionData.feeGrowthInside0LastX128,
            positionData.feeGrowthInside1LastX128,
            ,

        ) = UNISWAP_V3_POSITION_MANAGER.positions(tokenId);

        positionData.priceA = PARASPACE_ORACLE.getAssetPrice(
            positionData.tokenA
        );
        positionData.priceB = PARASPACE_ORACLE.getAssetPrice(
            positionData.tokenB
        );

        positionData.tokenADecimal = IERC20Detailed(positionData.tokenA)
            .decimals();
        positionData.tokenBDecimal = IERC20Detailed(positionData.tokenB)
            .decimals();

        // TODO using bit shifting for the 2^96
        // positionData.sqrtPriceX96;

        if (positionData.tokenBDecimal == positionData.tokenADecimal) {
            // multiply by 10^18 then divide by 10^9 to preserve price in wei
            positionData.sqrtPriceX96 = uint160(
                (SqrtLib.sqrt(
                    ((positionData.priceA * (10**18)) / (positionData.priceB))
                ) * 2**96) / 10E9
            );
        } else if (positionData.tokenBDecimal > positionData.tokenADecimal) {
            // multiple by 10^(decimalB - decimalA) to preserve price in wei
            positionData.sqrtPriceX96 = uint160(
                (SqrtLib.sqrt(
                    (positionData.priceA *
                        (10 **
                            (18 +
                                positionData.tokenBDecimal -
                                positionData.tokenADecimal))) /
                        (positionData.priceB)
                ) * 2**96) / 10E9
            );
        } else {
            // multiple by 10^(decimalA - decimalB) to preserve price in wei then divid by the same number
            positionData.sqrtPriceX96 = uint160(
                (SqrtLib.sqrt(
                    (positionData.priceA *
                        (10 **
                            (18 +
                                positionData.tokenADecimal -
                                positionData.tokenBDecimal))) /
                        (positionData.priceB)
                ) * 2**96) /
                    10 **
                        (9 +
                            positionData.tokenADecimal -
                            positionData.tokenBDecimal)
            );
        }

        (positionData.amountA, positionData.amountB) = LiquidityAmounts
            .getAmountsForLiquidity(
                positionData.sqrtPriceX96,
                TickMath.getSqrtRatioAtTick(positionData.tickLower),
                TickMath.getSqrtRatioAtTick(positionData.tickUpper),
                positionData.liquidity
            );

        (
            uint256 unclaimedTokenAFee,
            uint256 unclaimedTokenBFee
        ) = getFeeAmounts(positionData);

        return
            (((positionData.amountA + unclaimedTokenAFee) *
                positionData.priceA) / 10**positionData.tokenADecimal) +
            (((positionData.amountB + unclaimedTokenBFee) *
                positionData.priceB) / 10**positionData.tokenBDecimal);
    }

    function getFeeAmounts(DataTypes.UinswapV3PositionData memory positionData)
        internal
        view
        returns (uint256 unclaimedTokenAFees, uint256 unclaimedTokenBFees)
    {
        IUniswapV3PoolState pool = IUniswapV3PoolState(
            UNISWAP_V3_FACTORY.getPool(
                positionData.tokenA,
                positionData.tokenB,
                positionData.fee
            )
        );
        FeeParams memory feeParams;

        (
            ,
            ,
            feeParams.feeGrowthOutside0X128Lower,
            feeParams.feeGrowthOutside1X128Lower,
            ,
            ,
            ,

        ) = pool.ticks(positionData.tickLower);
        (
            ,
            ,
            feeParams.feeGrowthOutside0X128Upper,
            feeParams.feeGrowthOutside1X128Upper,
            ,
            ,
            ,

        ) = pool.ticks(positionData.tickUpper);

        uint256 feeGrowthGlobal0X128 = pool.feeGrowthGlobal0X128();
        uint256 feeGrowthGlobal1X128 = pool.feeGrowthGlobal1X128();

        int24 tickCurrent = TickMath.getTickAtSqrtRatio(
            positionData.sqrtPriceX96
        );

        unchecked {
            // calculate fee growth below
            uint256 feeGrowthBelow0X128;
            uint256 feeGrowthBelow1X128;
            if (tickCurrent >= positionData.tickLower) {
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
            if (tickCurrent < positionData.tickUpper) {
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

            unclaimedTokenAFees =
                ((feeGrowthInside0X128 -
                    positionData.feeGrowthInside0LastX128) *
                    positionData.liquidity) /
                Q128;

            unclaimedTokenAFees =
                ((feeGrowthInside1X128 -
                    positionData.feeGrowthInside1LastX128) *
                    positionData.liquidity) /
                Q128;
        }
    }

    // get list of tokens prices
    function getTokensPrices(uint256[] calldata tokenIds)
        external
        view
        returns (uint256[] memory)
    {
        uint256[] memory prices = new uint256[](tokenIds.length);

        for (uint256 index = 0; index < tokenIds.length; index++) {
            prices[index] = getTokenPrice(tokenIds[index]);
        }

        return prices;
    }

    function getTokensPricesSum(uint256[] calldata tokenIds)
        external
        view
        returns (uint256)
    {
        uint256 sum = 0;

        for (uint256 index = 0; index < tokenIds.length; index++) {
            sum += getTokenPrice(tokenIds[index]);
        }

        return sum;
    }

    function latestAnswer() external view returns (int256) {
        return 0;
    }
}
