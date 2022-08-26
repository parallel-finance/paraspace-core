// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IAtomicPriceAggregator} from "../interfaces/IAtomicPriceAggregator.sol";
import {IUniswapV3PositionInfoProvider} from "../interfaces/IUniswapV3PositionInfoProvider.sol";
import {IParaSpaceOracle} from "../interfaces/IParaSpaceOracle.sol";
import {IUniswapV3Factory} from "../dependencies/uniswap/IUniswapV3Factory.sol";
import {IUniswapV3PoolState} from "../dependencies/uniswap/IUniswapV3PoolState.sol";
import {INonfungiblePositionManager} from "../dependencies/uniswap/INonfungiblePositionManager.sol";
import {LiquidityAmounts} from "../dependencies/uniswap/LiquidityAmounts.sol";
import {TickMath} from "../dependencies/uniswap/libraries/TickMath.sol";
import {SqrtLib} from "../dependencies/math/SqrtLib.sol";
import {IERC20Detailed} from "../dependencies/openzeppelin/contracts/IERC20Detailed.sol";

contract UniswapV3OracleWrapper is
    IAtomicPriceAggregator,
    IUniswapV3PositionInfoProvider
{
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

    struct PairOracleData {
        uint256 tokenAPrice;
        uint256 tokenBPrice;
        uint8 tokenADecimal;
        uint8 tokenBDecimal;
        uint160 sqrtPriceX96;
    }

    struct UinswapV3PositionData {
        address tokenA;
        address tokenB;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 positionFeeGrowthInsideALastX128;
        uint256 positionFeeGrowthInsideBLastX128;
        uint256 tokensOwedA;
        uint256 tokensOwedB;
    }

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
        )
    {
        (
            ,
            ,
            token0,
            token1,
            fee,
            tickLower,
            tickUpper,
            ,
            ,
            ,
            ,

        ) = UNISWAP_V3_POSITION_MANAGER.positions(tokenId);

        IUniswapV3PoolState pool = IUniswapV3PoolState(
            UNISWAP_V3_FACTORY.getPool(token0, token1, fee)
        );
        (, currentTick, , , , , ) = pool.slot0();
    }

    function getLiquidityAmount(uint256 tokenId)
        external
        view
        returns (uint256 token0Amount, uint256 token1Amount)
    {
        UinswapV3PositionData memory positionData = _getPositionData(tokenId);
        PairOracleData memory oracleData = _getOracleData(positionData);
        (token0Amount, token1Amount) = _getLiquidityAmount(
            oracleData.sqrtPriceX96,
            positionData
        );
    }

    function getLpFeeAmount(uint256 tokenId)
        external
        view
        returns (uint256 token0Amount, uint256 token1Amount)
    {
        UinswapV3PositionData memory positionData = _getPositionData(tokenId);
        (token0Amount, token1Amount) = _getLpFeeAmount(positionData);
    }

    // get token price
    function getTokenPrice(uint256 tokenId) public view returns (uint256) {
        UinswapV3PositionData memory positionData = _getPositionData(tokenId);

        PairOracleData memory oracleData = _getOracleData(positionData);

        (
            uint256 liquidityAmountA,
            uint256 liquidityAmountB
        ) = _getLiquidityAmount(oracleData.sqrtPriceX96, positionData);

        (uint256 feeAmountA, uint256 feeAmountB) = _getLpFeeAmount(
            positionData
        );

        return
            (((liquidityAmountA + feeAmountA) * oracleData.tokenAPrice) /
                10**oracleData.tokenADecimal) +
            (((liquidityAmountB + feeAmountB) * oracleData.tokenBPrice) /
                10**oracleData.tokenBDecimal);
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

    function _getOracleData(UinswapV3PositionData memory positionData)
        internal
        view
        returns (PairOracleData memory)
    {
        PairOracleData memory oracleData;
        oracleData.tokenAPrice = PARASPACE_ORACLE.getAssetPrice(
            positionData.tokenA
        );
        oracleData.tokenBPrice = PARASPACE_ORACLE.getAssetPrice(
            positionData.tokenB
        );

        oracleData.tokenADecimal = IERC20Detailed(positionData.tokenA)
            .decimals();
        oracleData.tokenBDecimal = IERC20Detailed(positionData.tokenB)
            .decimals();

        // TODO using bit shifting for the 2^96
        // positionData.sqrtPriceX96;

        if (oracleData.tokenBDecimal == oracleData.tokenADecimal) {
            // multiply by 10^18 then divide by 10^9 to preserve price in wei
            oracleData.sqrtPriceX96 = uint160(
                (SqrtLib.sqrt(
                    ((oracleData.tokenAPrice * (10**18)) /
                        (oracleData.tokenBPrice))
                ) * 2**96) / 10E9
            );
        } else if (oracleData.tokenBDecimal > oracleData.tokenADecimal) {
            // multiple by 10^(decimalB - decimalA) to preserve price in wei
            oracleData.sqrtPriceX96 = uint160(
                (SqrtLib.sqrt(
                    (oracleData.tokenAPrice *
                        (10 **
                            (18 +
                                oracleData.tokenBDecimal -
                                oracleData.tokenADecimal))) /
                        (oracleData.tokenBPrice)
                ) * 2**96) / 10E9
            );
        } else {
            // multiple by 10^(decimalA - decimalB) to preserve price in wei then divid by the same number
            oracleData.sqrtPriceX96 = uint160(
                (SqrtLib.sqrt(
                    (oracleData.tokenAPrice *
                        (10 **
                            (18 +
                                oracleData.tokenADecimal -
                                oracleData.tokenBDecimal))) /
                        (oracleData.tokenBPrice)
                ) * 2**96) /
                    10 **
                        (9 +
                            oracleData.tokenADecimal -
                            oracleData.tokenBDecimal)
            );
        }

        return oracleData;
    }

    function _getPositionData(uint256 tokenId)
        internal
        view
        returns (UinswapV3PositionData memory)
    {
        UinswapV3PositionData memory positionData;
        (
            ,
            ,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 positionFeeGrowthInside0LastX128,
            uint256 positionFeeGrowthInside1LastX128,
            uint256 tokensOwed0,
            uint256 tokensOwed1
        ) = UNISWAP_V3_POSITION_MANAGER.positions(tokenId);

        return
            UinswapV3PositionData({
                tokenA: token0,
                tokenB: token1,
                fee: fee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidity: liquidity,
                positionFeeGrowthInsideALastX128: positionFeeGrowthInside0LastX128,
                positionFeeGrowthInsideBLastX128: positionFeeGrowthInside1LastX128,
                tokensOwedA: tokensOwed0,
                tokensOwedB: tokensOwed1
            });
    }

    function _getLiquidityAmount(
        uint160 sqrtRatioX96,
        UinswapV3PositionData memory positionData
    ) internal pure returns (uint256 token0Amount, uint256 token1Amount) {
        (token0Amount, token1Amount) = LiquidityAmounts.getAmountsForLiquidity(
            sqrtRatioX96,
            TickMath.getSqrtRatioAtTick(positionData.tickLower),
            TickMath.getSqrtRatioAtTick(positionData.tickUpper),
            positionData.liquidity
        );
    }

    function _getLpFeeAmount(UinswapV3PositionData memory positionData)
        internal
        view
        returns (uint256 token0Amount, uint256 token1Amount)
    {
        (token0Amount, token1Amount) = _getPendingFeeAmounts(positionData);

        token0Amount += positionData.tokensOwedA;
        token1Amount += positionData.tokensOwedB;
    }

    function _getPendingFeeAmounts(UinswapV3PositionData memory positionData)
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

        (, int24 tickCurrent, , , , , ) = pool.slot0();

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
                    positionData.positionFeeGrowthInsideALastX128) *
                    positionData.liquidity) /
                Q128;

            unclaimedTokenBFees =
                ((feeGrowthInside1X128 -
                    positionData.positionFeeGrowthInsideBLastX128) *
                    positionData.liquidity) /
                Q128;
        }
    }
}
