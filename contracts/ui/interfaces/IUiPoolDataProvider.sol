// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {DataTypes} from "../../protocol/libraries/types/DataTypes.sol";

interface IUiPoolDataProvider {
    struct InterestRates {
        uint256 variableRateSlope1;
        uint256 variableRateSlope2;
        uint256 stableRateSlope1;
        uint256 stableRateSlope2;
        uint256 baseStableBorrowRate;
        uint256 baseVariableBorrowRate;
        uint256 optimalUsageRatio;
    }

    struct AggregatedReserveData {
        address underlyingAsset;
        string name;
        string symbol;
        uint256 decimals;
        uint256 baseLTVasCollateral;
        uint256 reserveLiquidationThreshold;
        uint256 reserveLiquidationBonus;
        uint256 reserveFactor;
        bool usageAsCollateralEnabled;
        bool borrowingEnabled;
        bool stableBorrowRateEnabled;
        bool auctionEnabled;
        bool dynamicConfigsEnabled;
        bool isActive;
        bool isFrozen;
        bool isPaused;
        // base data
        uint128 liquidityIndex;
        uint128 variableBorrowIndex;
        uint128 liquidityRate;
        uint128 variableBorrowRate;
        uint128 stableBorrowRate;
        uint40 lastUpdateTimestamp;
        address xTokenAddress;
        address stableDebtTokenAddress;
        address variableDebtTokenAddress;
        address interestRateStrategyAddress;
        address auctionStrategyAddress;
        address dynamicConfigsStrategyAddress;
        uint256 availableLiquidity;
        uint256 totalPrincipalStableDebt;
        uint256 averageStableRate;
        uint256 stableDebtLastUpdateTimestamp;
        uint256 totalScaledVariableDebt;
        uint256 priceInMarketReferenceCurrency;
        address priceOracle;
        uint256 variableRateSlope1;
        uint256 variableRateSlope2;
        uint256 stableRateSlope1;
        uint256 stableRateSlope2;
        uint256 baseStableBorrowRate;
        uint256 baseVariableBorrowRate;
        uint256 optimalUsageRatio;
        uint128 accruedToTreasury;
        uint256 borrowCap;
        uint256 supplyCap;
        //AssetType
        DataTypes.AssetType assetType;
    }

    struct UserReserveData {
        address underlyingAsset;
        uint256 scaledXTokenBalance;
        uint256 collaterizedBalance;
        bool usageAsCollateralEnabledOnUser;
        uint256 stableBorrowRate;
        uint256 scaledVariableDebt;
        uint256 principalStableDebt;
        uint256 stableBorrowLastUpdateTimestamp;
    }

    struct BaseCurrencyInfo {
        uint256 marketReferenceCurrencyUnit;
        int256 marketReferenceCurrencyPriceInUsd;
        int256 networkBaseTokenPriceInUsd;
        uint8 networkBaseTokenPriceDecimals;
    }

    struct UniswapV3LpTokenInfo {
        address token0;
        address token1;
        uint24 feeRate;
        int24 positionTickLower;
        int24 positionTickUpper;
        int24 currentTick;
        uint128 liquidity;
        uint256 liquidityToken0Amount;
        uint256 liquidityToken1Amount;
        uint256 lpFeeToken0Amount;
        uint256 lpFeeToken1Amount;
        uint256 tokenPrice;
        uint256 baseLTVasCollateral;
        uint256 reserveLiquidationThreshold;
    }

    function getReservesList(IPoolAddressesProvider provider)
        external
        view
        returns (address[] memory);

    function getReservesData(IPoolAddressesProvider provider)
        external
        view
        returns (AggregatedReserveData[] memory, BaseCurrencyInfo memory);

    function getUserReservesData(IPoolAddressesProvider provider, address user)
        external
        view
        returns (UserReserveData[] memory);

    function getNTokenData(
        address user,
        address[] memory nTokenAddresses,
        uint256[][] memory tokenIds
    ) external view returns (DataTypes.NTokenData[][] memory);

    function getAuctionData(
        IPoolAddressesProvider provider,
        address user,
        address[] memory nTokenAddresses,
        uint256[][] memory tokenIds
    ) external view returns (DataTypes.AuctionData[][] memory);

    function getUniswapV3LpTokenData(
        IPoolAddressesProvider provider,
        address lpTokenAddress,
        uint256 tokenId
    ) external view returns (UniswapV3LpTokenInfo memory);
}
