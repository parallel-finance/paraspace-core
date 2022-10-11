// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IERC20Detailed} from "../dependencies/openzeppelin/contracts/IERC20Detailed.sol";
import {ReserveConfiguration} from "../protocol/libraries/configuration/ReserveConfiguration.sol";
import {UserConfiguration} from "../protocol/libraries/configuration/UserConfiguration.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";
import {WadRayMath} from "../protocol/libraries/math/WadRayMath.sol";
import {IPoolAddressesProvider} from "../interfaces/IPoolAddressesProvider.sol";
import {IStableDebtToken} from "../interfaces/IStableDebtToken.sol";
import {IVariableDebtToken} from "../interfaces/IVariableDebtToken.sol";
import {IPool} from "../interfaces/IPool.sol";
import {IProtocolDataProvider} from "../interfaces/IProtocolDataProvider.sol";

/**
 * @title ProtocolDataProvider
 *
 * @notice Peripheral contract to collect and pre-process information from the Pool.
 */
contract ProtocolDataProvider is IProtocolDataProvider {
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using WadRayMath for uint256;

    address constant MKR = 0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2;
    address constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;

    constructor(IPoolAddressesProvider addressesProvider) {
        ADDRESSES_PROVIDER = addressesProvider;
    }

    /// @inheritdoc IProtocolDataProvider
    function getAllReservesTokens()
        external
        view
        returns (DataTypes.TokenData[] memory)
    {
        IPool pool = IPool(ADDRESSES_PROVIDER.getPool());
        address[] memory reserves = pool.getReservesList();
        DataTypes.TokenData[] memory reservesTokens = new DataTypes.TokenData[](
            reserves.length
        );
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i] == MKR) {
                reservesTokens[i] = DataTypes.TokenData({
                    symbol: "MKR",
                    tokenAddress: reserves[i]
                });
                continue;
            }
            if (reserves[i] == ETH) {
                reservesTokens[i] = DataTypes.TokenData({
                    symbol: "ETH",
                    tokenAddress: reserves[i]
                });
                continue;
            }
            reservesTokens[i] = DataTypes.TokenData({
                symbol: IERC20Detailed(reserves[i]).symbol(),
                tokenAddress: reserves[i]
            });
        }
        return reservesTokens;
    }

    /// @inheritdoc IProtocolDataProvider
    function getAllPTokens()
        external
        view
        returns (DataTypes.TokenData[] memory)
    {
        IPool pool = IPool(ADDRESSES_PROVIDER.getPool());
        address[] memory reserves = pool.getReservesList();
        DataTypes.TokenData[] memory xTokens = new DataTypes.TokenData[](
            reserves.length
        );
        for (uint256 i = 0; i < reserves.length; i++) {
            DataTypes.ReserveData memory reserveData = pool.getReserveData(
                reserves[i]
            );
            xTokens[i] = DataTypes.TokenData({
                symbol: IERC20Detailed(reserveData.xTokenAddress).symbol(),
                tokenAddress: reserveData.xTokenAddress
            });
        }
        return xTokens;
    }

    /// @inheritdoc IProtocolDataProvider
    function getReserveConfigurationData(address asset)
        external
        view
        returns (
            uint256 decimals,
            uint256 ltv,
            uint256 liquidationThreshold,
            uint256 liquidationBonus,
            uint256 reserveFactor,
            bool usageAsCollateralEnabled,
            bool borrowingEnabled,
            bool stableBorrowRateEnabled,
            bool isActive,
            bool isFrozen
        )
    {
        DataTypes.ReserveConfigurationMap memory configuration = IPool(
            ADDRESSES_PROVIDER.getPool()
        ).getConfiguration(asset);

        (
            ltv,
            liquidationThreshold,
            liquidationBonus,
            decimals,
            reserveFactor,

        ) = configuration.getParams();

        (
            isActive,
            isFrozen,
            borrowingEnabled,
            stableBorrowRateEnabled,
            ,

        ) = configuration.getFlags();

        usageAsCollateralEnabled = liquidationThreshold != 0;
    }

    /// @inheritdoc IProtocolDataProvider
    function getReserveCaps(address asset)
        external
        view
        returns (uint256 borrowCap, uint256 supplyCap)
    {
        (borrowCap, supplyCap) = IPool(ADDRESSES_PROVIDER.getPool())
            .getConfiguration(asset)
            .getCaps();
    }

    /// @inheritdoc IProtocolDataProvider
    function getPaused(address asset) external view returns (bool isPaused) {
        (, , , , isPaused, ) = IPool(ADDRESSES_PROVIDER.getPool())
            .getConfiguration(asset)
            .getFlags();
    }

    /// @inheritdoc IProtocolDataProvider
    function getSiloedBorrowing(address asset) external view returns (bool) {
        return
            IPool(ADDRESSES_PROVIDER.getPool())
                .getConfiguration(asset)
                .getSiloedBorrowing();
    }

    /// @inheritdoc IProtocolDataProvider
    function getLiquidationProtocolFee(address asset)
        external
        view
        returns (uint256)
    {
        return
            IPool(ADDRESSES_PROVIDER.getPool())
                .getConfiguration(asset)
                .getLiquidationProtocolFee();
    }

    /// @inheritdoc IProtocolDataProvider
    function getReserveData(address asset)
        external
        view
        override
        returns (
            uint256 accruedToTreasuryScaled,
            uint256 totalPToken,
            uint256 totalStableDebt,
            uint256 totalVariableDebt,
            uint256 liquidityRate,
            uint256 variableBorrowRate,
            uint256 stableBorrowRate,
            uint256 averageStableBorrowRate,
            uint256 liquidityIndex,
            uint256 variableBorrowIndex,
            uint40 lastUpdateTimestamp
        )
    {
        DataTypes.ReserveData memory reserve = IPool(
            ADDRESSES_PROVIDER.getPool()
        ).getReserveData(asset);

        return (
            reserve.accruedToTreasury,
            IERC20Detailed(reserve.xTokenAddress).totalSupply(),
            IERC20Detailed(reserve.stableDebtTokenAddress).totalSupply(),
            IERC20Detailed(reserve.variableDebtTokenAddress).totalSupply(),
            reserve.currentLiquidityRate,
            reserve.currentVariableBorrowRate,
            reserve.currentStableBorrowRate,
            IStableDebtToken(reserve.stableDebtTokenAddress)
                .getAverageStableRate(),
            reserve.liquidityIndex,
            reserve.variableBorrowIndex,
            reserve.lastUpdateTimestamp
        );
    }

    /// @inheritdoc IProtocolDataProvider
    function getPTokenTotalSupply(address asset)
        external
        view
        override
        returns (uint256)
    {
        DataTypes.ReserveData memory reserve = IPool(
            ADDRESSES_PROVIDER.getPool()
        ).getReserveData(asset);
        return IERC20Detailed(reserve.xTokenAddress).totalSupply();
    }

    /// @inheritdoc IProtocolDataProvider
    function getTotalDebt(address asset)
        external
        view
        override
        returns (uint256)
    {
        DataTypes.ReserveData memory reserve = IPool(
            ADDRESSES_PROVIDER.getPool()
        ).getReserveData(asset);
        return
            IERC20Detailed(reserve.stableDebtTokenAddress).totalSupply() +
            IERC20Detailed(reserve.variableDebtTokenAddress).totalSupply();
    }

    /// @inheritdoc IProtocolDataProvider
    function getUserReserveData(address asset, address user)
        external
        view
        returns (
            uint256 currentPTokenBalance,
            uint256 currentStableDebt,
            uint256 currentVariableDebt,
            uint256 principalStableDebt,
            uint256 scaledVariableDebt,
            uint256 stableBorrowRate,
            uint256 liquidityRate,
            uint40 stableRateLastUpdated,
            bool usageAsCollateralEnabled
        )
    {
        DataTypes.ReserveData memory reserve = IPool(
            ADDRESSES_PROVIDER.getPool()
        ).getReserveData(asset);

        DataTypes.UserConfigurationMap memory userConfig = IPool(
            ADDRESSES_PROVIDER.getPool()
        ).getUserConfiguration(user);

        currentPTokenBalance = IERC20Detailed(reserve.xTokenAddress).balanceOf(
            user
        );
        currentVariableDebt = IERC20Detailed(reserve.variableDebtTokenAddress)
            .balanceOf(user);
        currentStableDebt = IERC20Detailed(reserve.stableDebtTokenAddress)
            .balanceOf(user);
        principalStableDebt = IStableDebtToken(reserve.stableDebtTokenAddress)
            .principalBalanceOf(user);
        scaledVariableDebt = IVariableDebtToken(
            reserve.variableDebtTokenAddress
        ).scaledBalanceOf(user);
        liquidityRate = reserve.currentLiquidityRate;
        stableBorrowRate = IStableDebtToken(reserve.stableDebtTokenAddress)
            .getUserStableRate(user);
        stableRateLastUpdated = IStableDebtToken(reserve.stableDebtTokenAddress)
            .getUserLastUpdated(user);
        usageAsCollateralEnabled = userConfig.isUsingAsCollateral(reserve.id);
    }

    /// @inheritdoc IProtocolDataProvider
    function getReserveTokensAddresses(address asset)
        external
        view
        returns (
            address xTokenAddress,
            address stableDebtTokenAddress,
            address variableDebtTokenAddress
        )
    {
        DataTypes.ReserveData memory reserve = IPool(
            ADDRESSES_PROVIDER.getPool()
        ).getReserveData(asset);

        return (
            reserve.xTokenAddress,
            reserve.stableDebtTokenAddress,
            reserve.variableDebtTokenAddress
        );
    }

    /// @inheritdoc IProtocolDataProvider
    function getStrategyAddresses(address asset)
        external
        view
        returns (
            address interestRateStrategyAddress,
            address dynamicConfigsStrategyAddress,
            address auctionStrategyAddress
        )
    {
        DataTypes.ReserveData memory reserve = IPool(
            ADDRESSES_PROVIDER.getPool()
        ).getReserveData(asset);

        return (
            reserve.interestRateStrategyAddress,
            reserve.dynamicConfigsStrategyAddress,
            reserve.auctionStrategyAddress
        );
    }
}
