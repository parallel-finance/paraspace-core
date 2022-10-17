// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import {IPoolAddressesProvider} from "./IPoolAddressesProvider.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

/**
 * @title IPool
 *
 * @notice Defines the basic interface for an ParaSpace Pool.
 **/
interface IPoolParameters {
    /**
     * @dev Emitted when the state of a reserve is updated.
     * @param reserve The address of the underlying asset of the reserve
     * @param liquidityRate The next liquidity rate
     * @param variableBorrowRate The next variable borrow rate
     * @param liquidityIndex The next liquidity index
     * @param variableBorrowIndex The next variable borrow index
     **/
    event ReserveDataUpdated(
        address indexed reserve,
        uint256 liquidityRate,
        uint256 variableBorrowRate,
        uint256 liquidityIndex,
        uint256 variableBorrowIndex
    );

    /**
     * @notice Initializes a reserve, activating it, assigning an xToken and debt tokens and an
     * interest rate strategy
     * @dev Only callable by the PoolConfigurator contract
     * @param asset The address of the underlying asset of the reserve
     * @param xTokenAddress The address of the xToken that will be assigned to the reserve
     * @param variableDebtAddress The address of the VariableDebtToken that will be assigned to the reserve
     * @param interestRateStrategyAddress The address of the interest rate strategy contract
     **/
    function initReserve(
        address asset,
        address xTokenAddress,
        address variableDebtAddress,
        address interestRateStrategyAddress,
        address auctionStrategyAddress
    ) external;

    /**
     * @notice Drop a reserve
     * @dev Only callable by the PoolConfigurator contract
     * @param asset The address of the underlying asset of the reserve
     **/
    function dropReserve(address asset) external;

    /**
     * @notice Updates the address of the interest rate strategy contract
     * @dev Only callable by the PoolConfigurator contract
     * @param asset The address of the underlying asset of the reserve
     * @param rateStrategyAddress The address of the interest rate strategy contract
     **/
    function setReserveInterestRateStrategyAddress(
        address asset,
        address rateStrategyAddress
    ) external;

    /**
     * @notice Updates the address of the auction strategy contract
     * @dev Only callable by the PoolConfigurator contract
     * @param asset The address of the underlying asset of the reserve
     * @param auctionStrategyAddress The address of the auction strategy contract
     **/
    function setReserveAuctionStrategyAddress(
        address asset,
        address auctionStrategyAddress
    ) external;

    /**
     * @notice Sets the configuration bitmap of the reserve as a whole
     * @dev Only callable by the PoolConfigurator contract
     * @param asset The address of the underlying asset of the reserve
     * @param configuration The new configuration bitmap
     **/
    function setConfiguration(
        address asset,
        DataTypes.ReserveConfigurationMap calldata configuration
    ) external;

    /**
     * @notice Mints the assets accrued through the reserve factor to the treasury in the form of xTokens
     * @param assets The list of reserves for which the minting needs to be executed
     **/
    function mintToTreasury(address[] calldata assets) external;

    /**
     * @notice Rescue and transfer tokens locked in this contract
     * @param assetType The asset type of the token
     * @param token The address of the token
     * @param to The address of the recipient
     * @param amountOrTokenId The amount or id of token to transfer
     */
    function rescueTokens(
        DataTypes.AssetType assetType,
        address token,
        address to,
        uint256 amountOrTokenId
    ) external;

    /**
     * @notice Updates the address of the dynamic configs strategy contract
     * @dev Only callable by the PoolConfigurator contract
     * @param asset The address of the underlying asset of the reserve
     * @param dynamicConfigsStrategyAddress The address of the interest rate strategy contract
     **/
    function setReserveDynamicConfigsStrategyAddress(
        address asset,
        address dynamicConfigsStrategyAddress
    ) external;

    /**
     * @notice increase user's total atomic tokens counter
     * @param asset The address of the ntoken underlying asset
     * @param user The address of the user
     * @param changeBy The amount to increase by
     */
    function increaseUserTotalAtomicTokens(
        address asset,
        address user,
        uint24 changeBy
    ) external;

    /**
     * @notice decrease user's total atomic tokens counter
     * @param asset The address of the ntoken underlying asset
     * @param user The address of the user
     * @param changeBy The amount to decrease by
     */
    function decreaseUserTotalAtomicTokens(
        address asset,
        address user,
        uint24 changeBy
    ) external;

    /**
     * @notice set the maximum allowed atomic tokens per user
     * @param value The maximum amount
     */
    function setMaxAtomicTokensAllowed(uint24 value) external;

    /**
     * @notice Set the auction recovery health factor
     * @param value The new auction health factor
     */
    function setAuctionRecoveryHealthFactor(uint64 value) external;

    /**
     * @notice Set auction validity time, all auctions triggered before the validity time will be considered as invalid
     * @param user The user address
     */
    function setAuctionValidityTime(address user) external;

    /**
     * @notice Returns the user account data across all the reserves
     * @param user The address of the user
     * @return totalCollateralBase The total collateral of the user in the base currency used by the price feed
     * @return totalDebtBase The total debt of the user in the base currency used by the price feed
     * @return availableBorrowsBase The borrowing power left of the user in the base currency used by the price feed
     * @return currentLiquidationThreshold The liquidation threshold of the user
     * @return ltv The loan to value of The user
     * @return healthFactor The current health factor of the user
     **/
    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor,
            uint256 erc721HealthFactor
        );
}
