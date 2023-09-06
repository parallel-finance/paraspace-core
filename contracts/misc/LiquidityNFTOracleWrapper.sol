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
import {SafeCast} from "../dependencies/uniswapv3-core/libraries/SafeCast.sol";
import {FixedPoint96} from "../dependencies/uniswapv3-core/libraries/FixedPoint96.sol";
import {IERC20Detailed} from "../dependencies/openzeppelin/contracts/IERC20Detailed.sol";
import {SqrtLib} from "../dependencies/math/SqrtLib.sol";

abstract contract LiquidityNFTOracleWrapper is ILiquidityNFTOracleWrapper {
    using SafeCast for uint256;

    address immutable DEX_FACTORY;
    address immutable POSITION_MANAGER;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;

    uint256 internal constant Q128 = 0x100000000000000000000000000000000;

    constructor(address _factory, address _manager, address _addressProvider) {
        DEX_FACTORY = _factory;
        POSITION_MANAGER = _manager;
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressProvider);
    }

    /**
     * @notice get onchain position data from uniswap for the specified tokenId.
     */
    function getOnchainPositionData(
        uint256 tokenId
    ) external view returns (LiquidityNFTPositionData memory positionData) {
        (, positionData) = _getOnchainPositionData(tokenId);
    }

    /**
     * @notice get onchain liquidity amount for the specified tokenId.
     */
    function getLiquidityAmount(
        uint256 tokenId
    ) external view returns (uint256 token0Amount, uint256 token1Amount) {
        (
            ,
            LiquidityNFTPositionData memory positionData
        ) = _getOnchainPositionData(tokenId);
        (token0Amount, token1Amount) = _calculateLiquidityAmount(
            positionData.tickLower,
            positionData.tickUpper,
            positionData.currentPrice,
            positionData.liquidity
        );
    }

    /**
     * @notice calculate liquidity amount for the position data.
     * @param positionData The specified position data
     */
    function getLiquidityAmountFromPositionData(
        LiquidityNFTPositionData memory positionData
    ) external pure returns (uint256 token0Amount, uint256 token1Amount) {
        (token0Amount, token1Amount) = _calculateLiquidityAmount(
            positionData.tickLower,
            positionData.tickUpper,
            positionData.currentPrice,
            positionData.liquidity
        );
    }

    /**
     * @notice get liquidity provider fee amount for the specified tokenId.
     */
    function getLpFeeAmount(
        uint256 tokenId
    ) external view returns (uint256 token0Amount, uint256 token1Amount) {
        (
            address pool,
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
        address pool = _getPoolAddress(
            positionData.token0,
            positionData.token1,
            positionData.fee
        );
        return _getLpFeeAmountFromPositionData(pool, positionData);
    }

    /**
     * @notice Returns the price for the specified tokenId.
     */
    function getTokenPrice(uint256 tokenId) public view returns (uint256) {
        (
            address pool,
            LiquidityNFTPositionData memory positionData
        ) = _getOnchainPositionData(tokenId);

        PairOracleData memory oracleData = _getOracleData(
            IPriceOracleGetter(ADDRESSES_PROVIDER.getPriceOracle()),
            positionData
        );

        (
            uint256 liquidityAmount0,
            uint256 liquidityAmount1
        ) = _calculateLiquidityAmount(
                positionData.tickLower,
                positionData.tickUpper,
                oracleData.sqrtPriceX96,
                positionData.liquidity
            );

        (
            uint256 feeAmount0,
            uint256 feeAmount1
        ) = _getLpFeeAmountFromPositionData(pool, positionData);

        return
            (((liquidityAmount0 + feeAmount0) * oracleData.token0Price) /
                10 ** oracleData.token0Decimal) +
            (((liquidityAmount1 + feeAmount1) * oracleData.token1Price) /
                10 ** oracleData.token1Decimal);
    }

    function _getLpFeeAmountFromPositionData(
        address pool,
        LiquidityNFTPositionData memory positionData
    ) internal view returns (uint256 token0Amount, uint256 token1Amount) {
        (token0Amount, token1Amount) = _getPendingFeeAmounts(
            pool,
            positionData
        );

        token0Amount += positionData.tokensOwed0;
        token1Amount += positionData.tokensOwed1;
    }

    function _getOracleData(
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

    function _calculateTokenFee(
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

    function _getPoolAddress(
        address,
        address,
        uint24
    ) internal view virtual returns (address) {
        return address(0);
    }

    function _getPendingFeeAmounts(
        address,
        LiquidityNFTPositionData memory
    ) internal view virtual returns (uint256, uint256) {
        return (0, 0);
    }

    function _getOnchainPositionData(
        uint256
    ) internal view virtual returns (address, LiquidityNFTPositionData memory) {
        LiquidityNFTPositionData memory positionData;
        return (address(0), positionData);
    }

    function _calculateLiquidityAmount(
        int24,
        int24,
        uint160,
        uint128
    ) internal pure virtual returns (uint256, uint256) {
        return (0, 0);
    }
}
