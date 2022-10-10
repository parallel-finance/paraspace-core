// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

interface IProtocolDataProvider {
    /**
     * @notice Returns the reserve data
     * @param asset The address of the underlying asset of the reserve
     * @return accruedToTreasuryScaled The scaled amount of tokens accrued to treasury that is to be minted
     * @return totalPToken The total supply of the xToken
     * @return totalStableDebt The total stable debt of the reserve
     * @return totalVariableDebt The total variable debt of the reserve
     * @return liquidityRate The liquidity rate of the reserve
     * @return variableBorrowRate The variable borrow rate of the reserve
     * @return stableBorrowRate The stable borrow rate of the reserve
     * @return averageStableBorrowRate The average stable borrow rate of the reserve
     * @return liquidityIndex The liquidity index of the reserve
     * @return variableBorrowIndex The variable borrow index of the reserve
     * @return lastUpdateTimestamp The timestamp of the last update of the reserve
     **/
    function getReserveData(address asset)
        external
        view
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
        );

    /**
     * @notice Returns the total supply of xTokens for a given asset
     * @param asset The address of the underlying asset of the reserve
     * @return The total supply of the xToken
     **/
    function getPTokenTotalSupply(address asset)
        external
        view
        returns (uint256);

    /**
     * @notice Returns the total debt for a given asset
     * @param asset The address of the underlying asset of the reserve
     * @return The total debt for asset
     **/
    function getTotalDebt(address asset) external view returns (uint256);

    /**
     * @notice Returns the list of the existing reserves in the pool.
     * @dev Handling MKR and ETH in a different way since they do not have standard `symbol` functions.
     * @return The list of reserves, pairs of symbols and addresses
     */
    function getAllReservesTokens()
        external
        view
        returns (DataTypes.TokenData[] memory);

    /**
     * @notice Returns the list of the existing PTokens in the pool.
     * @return The list of PTokens, pairs of symbols and addresses
     */
    function getAllPTokens()
        external
        view
        returns (DataTypes.TokenData[] memory);

    /**
     * @notice Returns the configuration data of the reserve
     * @dev Not returning borrow and supply caps for compatibility, nor pause flag
     * @param asset The address of the underlying asset of the reserve
     * @return decimals The number of decimals of the reserve
     * @return ltv The ltv of the reserve
     * @return liquidationThreshold The liquidationThreshold of the reserve
     * @return liquidationBonus The liquidationBonus of the reserve
     * @return reserveFactor The reserveFactor of the reserve
     * @return usageAsCollateralEnabled True if the usage as collateral is enabled, false otherwise
     * @return borrowingEnabled True if borrowing is enabled, false otherwise
     * @return stableBorrowRateEnabled True if stable rate borrowing is enabled, false otherwise
     * @return isActive True if it is active, false otherwise
     * @return isFrozen True if it is frozen, false otherwise
     **/
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
        );

    /**
     * @notice Returns the caps parameters of the reserve
     * @param asset The address of the underlying asset of the reserve
     * @return borrowCap The borrow cap of the reserve
     * @return supplyCap The supply cap of the reserve
     **/
    function getReserveCaps(address asset)
        external
        view
        returns (uint256, uint256);

    /**
     * @notice Returns if the pool is paused
     * @param asset The address of the underlying asset of the reserve
     * @return isPaused True if the pool is paused, false otherwise
     **/
    function getPaused(address asset) external view returns (bool);

    /**
     * @notice Returns the siloed borrowing flag
     * @param asset The address of the underlying asset of the reserve
     * @return True if the asset is siloed for borrowing
     **/
    function getSiloedBorrowing(address asset) external view returns (bool);

    /**
     * @notice Returns the protocol fee on the liquidation bonus
     * @param asset The address of the underlying asset of the reserve
     * @return The protocol fee on liquidation
     **/
    function getLiquidationProtocolFee(address asset)
        external
        view
        returns (uint256);

    /**
     * @notice Returns the user data in a reserve
     * @param asset The address of the underlying asset of the reserve
     * @param user The address of the user
     * @return currentPTokenBalance The current PToken balance of the user
     * @return currentStableDebt The current stable debt of the user
     * @return currentVariableDebt The current variable debt of the user
     * @return principalStableDebt The principal stable debt of the user
     * @return scaledVariableDebt The scaled variable debt of the user
     * @return stableBorrowRate The stable borrow rate of the user
     * @return liquidityRate The liquidity rate of the reserve
     * @return stableRateLastUpdated The timestamp of the last update of the user stable rate
     * @return usageAsCollateralEnabled True if the user is using the asset as collateral, false
     *         otherwise
     **/
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
        );

    /**
     * @notice Returns the token addresses of the reserve
     * @param asset The address of the underlying asset of the reserve
     * @return xTokenAddress The PToken address of the reserve
     * @return stableDebtTokenAddress The StableDebtToken address of the reserve
     * @return variableDebtTokenAddress The VariableDebtToken address of the reserve
     */
    function getReserveTokensAddresses(address asset)
        external
        view
        returns (
            address xTokenAddress,
            address stableDebtTokenAddress,
            address variableDebtTokenAddress
        );

    /**
     * @notice Returns the address of the Interest Rate strategy
     * @param asset The address of the underlying asset of the reserve
     * @return interestRateStrategyAddress The address of the Interest Rate strategy
     * @return dynamicConfigsStrategyAddress The address of the DynamicConfigs strategy
     * @return auctionStrategyAddress The address of the Auction strategy
     */
    function getStrategyAddresses(address asset)
        external
        view
        returns (
            address interestRateStrategyAddress,
            address dynamicConfigsStrategyAddress,
            address auctionStrategyAddress
        );
}
