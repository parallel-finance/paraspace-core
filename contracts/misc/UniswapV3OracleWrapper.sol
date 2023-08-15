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
import {LiquidityOracleLogic} from "./LiquidityOracleLogic.sol";

contract UniswapV3OracleWrapper is ILiquidityNFTOracleWrapper {
    IUniswapV3Factory immutable UNISWAP_V3_FACTORY;
    INonfungiblePositionManager immutable UNISWAP_V3_POSITION_MANAGER;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;

    constructor(
        address _factory,
        address _manager,
        address _addressProvider
    ) {
        UNISWAP_V3_FACTORY = IUniswapV3Factory(_factory);
        UNISWAP_V3_POSITION_MANAGER = INonfungiblePositionManager(_manager);
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressProvider);
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
        ) = UNISWAP_V3_POSITION_MANAGER.positions(tokenId);

        IUniswapV3PoolState pool = IUniswapV3PoolState(
            UNISWAP_V3_FACTORY.getPool(token0, token1, fee)
        );
        (uint160 currentPrice, int24 currentTick, , , , , ) = pool.slot0();

        return
            LiquidityNFTPositionData({
                token0: token0,
                token1: token1,
                fee: fee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                currentTick: currentTick,
                currentPrice: currentPrice,
                liquidity: liquidity,
                feeGrowthInside0LastX128: feeGrowthInside0LastX128,
                feeGrowthInside1LastX128: feeGrowthInside1LastX128,
                tokensOwed0: tokensOwed0,
                tokensOwed1: tokensOwed1
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
        (token0Amount, token1Amount) = LiquidityAmounts.getAmountsForLiquidity(
            positionData.currentPrice,
            TickMath.getSqrtRatioAtTick(positionData.tickLower),
            TickMath.getSqrtRatioAtTick(positionData.tickUpper),
            positionData.liquidity
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

        PairOracleData memory oracleData = LiquidityOracleLogic.getOracleData(
            IPriceOracleGetter(ADDRESSES_PROVIDER.getPriceOracle()),
            positionData
        );

        (uint256 liquidityAmount0, uint256 liquidityAmount1) = LiquidityAmounts
            .getAmountsForLiquidity(
                oracleData.sqrtPriceX96,
                TickMath.getSqrtRatioAtTick(positionData.tickLower),
                TickMath.getSqrtRatioAtTick(positionData.tickUpper),
                positionData.liquidity
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

    function _getPendingFeeAmounts(LiquidityNFTPositionData memory positionData)
        internal
        view
        returns (uint256 token0Amount, uint256 token1Amount)
    {
        IUniswapV3PoolState pool = IUniswapV3PoolState(
            UNISWAP_V3_FACTORY.getPool(
                positionData.token0,
                positionData.token1,
                positionData.fee
            )
        );
        OnChainFeeParams memory feeParams;

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

        feeParams.feeGrowthGlobal0X128 = pool.feeGrowthGlobal0X128();
        feeParams.feeGrowthGlobal1X128 = pool.feeGrowthGlobal1X128();

        (token0Amount, token1Amount) = LiquidityOracleLogic.calculateTokenFee(
            positionData,
            feeParams
        );
    }
}
