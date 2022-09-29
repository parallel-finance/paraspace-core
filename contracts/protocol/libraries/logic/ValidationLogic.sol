// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../../dependencies/openzeppelin/contracts/IERC721.sol";
import {Address} from "../../../dependencies/openzeppelin/contracts/Address.sol";
import {GPv2SafeERC20} from "../../../dependencies/gnosis/contracts/GPv2SafeERC20.sol";
import {IReserveInterestRateStrategy} from "../../../interfaces/IReserveInterestRateStrategy.sol";
import {IStableDebtToken} from "../../../interfaces/IStableDebtToken.sol";
import {IScaledBalanceToken} from "../../../interfaces/IScaledBalanceToken.sol";
import {IPriceOracleGetter} from "../../../interfaces/IPriceOracleGetter.sol";
import {IPToken} from "../../../interfaces/IPToken.sol";
import {ICollaterizableERC721} from "../../../interfaces/ICollaterizableERC721.sol";
import {IAuctionableERC721} from "../../../interfaces/IAuctionableERC721.sol";
import {INToken} from "../../../interfaces/INToken.sol";
import {SignatureChecker} from "../../../dependencies/looksrare/contracts/libraries/SignatureChecker.sol";
import {IPriceOracleSentinel} from "../../../interfaces/IPriceOracleSentinel.sol";
import {ReserveConfiguration} from "../configuration/ReserveConfiguration.sol";
import {AuctionConfiguration} from "../configuration/AuctionConfiguration.sol";
import {UserConfiguration} from "../configuration/UserConfiguration.sol";
import {Errors} from "../helpers/Errors.sol";
import {WadRayMath} from "../math/WadRayMath.sol";
import {PercentageMath} from "../math/PercentageMath.sol";
import {DataTypes} from "../types/DataTypes.sol";
import {ReserveLogic} from "./ReserveLogic.sol";
import {GenericLogic} from "./GenericLogic.sol";
import {SafeCast} from "../../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {IToken} from "../../../interfaces/IToken.sol";

/**
 * @title ReserveLogic library
 *
 * @notice Implements functions to validate the different actions of the protocol
 */
library ValidationLogic {
    using WadRayMath for uint256;
    using PercentageMath for uint256;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using AuctionConfiguration for DataTypes.ReserveAuctionConfigurationMap;
    using UserConfiguration for DataTypes.UserConfigurationMap;

    // Factor to apply to "only-variable-debt" liquidity rate to get threshold for rebalancing, expressed in bps
    // A value of 0.9e4 results in 90%
    uint256 public constant REBALANCE_UP_LIQUIDITY_RATE_THRESHOLD = 0.9e4;

    // Minimum health factor allowed under any circumstance
    // A value of 0.95e18 results in 0.95
    uint256 public constant MINIMUM_HEALTH_FACTOR_LIQUIDATION_THRESHOLD =
        0.95e18;

    /**
     * @dev Minimum health factor to consider a user position healthy
     * A value of 1e18 results in 1
     */
    uint256 public constant HEALTH_FACTOR_LIQUIDATION_THRESHOLD = 1e18;

    /**
     * @notice Validates a supply action.
     * @param reserveCache The cached data of the reserve
     * @param amount The amount to be supplied
     */
    function validateSupply(
        DataTypes.ReserveCache memory reserveCache,
        uint256 amount,
        DataTypes.AssetType assetType
    ) internal view {
        require(amount != 0, Errors.INVALID_AMOUNT);
        require(reserveCache.assetType == assetType, Errors.INVALID_ASSET_TYPE);

        (bool isActive, bool isFrozen, , , bool isPaused) = reserveCache
            .reserveConfiguration
            .getFlags();
        require(isActive, Errors.RESERVE_INACTIVE);
        require(!isPaused, Errors.RESERVE_PAUSED);
        require(!isFrozen, Errors.RESERVE_FROZEN);

        uint256 supplyCap = reserveCache.reserveConfiguration.getSupplyCap();

        if (assetType == DataTypes.AssetType.ERC20) {
            require(
                supplyCap == 0 ||
                    (IPToken(reserveCache.xTokenAddress)
                        .scaledTotalSupply()
                        .rayMul(reserveCache.nextLiquidityIndex) + amount) <=
                    supplyCap *
                        (10**reserveCache.reserveConfiguration.getDecimals()),
                Errors.SUPPLY_CAP_EXCEEDED
            );
        } else if (assetType == DataTypes.AssetType.ERC721) {
            require(
                supplyCap == 0 ||
                    (INToken(reserveCache.xTokenAddress).totalSupply() +
                        amount <=
                        supplyCap),
                Errors.SUPPLY_CAP_EXCEEDED
            );
        }
    }

    /**
     * @notice Validates a supply action from NToken contract
     * @param reserveCache The cached data of the reserve
     * @param params The params of the supply
     * @param assetType the type of the asset supplied
     */
    function validateSupplyFromNToken(
        DataTypes.ReserveCache memory reserveCache,
        DataTypes.ExecuteSupplyERC721Params memory params,
        DataTypes.AssetType assetType
    ) internal view {
        // TODO check if this is needed
        // require(
        //     msg.sender == reserveCache.xTokenAddress,
        //     Errors.SUPPLIER_NOT_NTOKEN
        // );

        uint256 amount = params.tokenData.length;

        validateSupply(reserveCache, amount, assetType);

        for (uint256 index = 0; index < amount; index++) {
            // validate that the owner of the underlying asset is the NToken  contract
            require(
                IERC721(params.asset).ownerOf(
                    params.tokenData[index].tokenId
                ) == reserveCache.xTokenAddress,
                Errors.NOT_THE_OWNER
            );
            // validate that the owner of the ntoken that has the same tokenId is the zero address
            require(
                IERC721(reserveCache.xTokenAddress).ownerOf(
                    params.tokenData[index].tokenId
                ) == address(0x0),
                Errors.NOT_THE_OWNER
            );
        }
    }

    /**
     * @notice Validates a withdraw action.
     * @param reserveCache The cached data of the reserve
     * @param amount The amount to be withdrawn
     * @param userBalance The balance of the user
     */
    function validateWithdraw(
        DataTypes.ReserveCache memory reserveCache,
        uint256 amount,
        uint256 userBalance
    ) internal pure {
        require(amount != 0, Errors.INVALID_AMOUNT);
        require(
            reserveCache.assetType == DataTypes.AssetType.ERC20,
            Errors.INVALID_ASSET_TYPE
        );

        require(
            amount <= userBalance,
            Errors.NOT_ENOUGH_AVAILABLE_USER_BALANCE
        );

        (bool isActive, , , , bool isPaused) = reserveCache
            .reserveConfiguration
            .getFlags();
        require(isActive, Errors.RESERVE_INACTIVE);
        require(!isPaused, Errors.RESERVE_PAUSED);
    }

    function validateWithdrawERC721(DataTypes.ReserveCache memory reserveCache)
        internal
        pure
    {
        require(
            reserveCache.assetType == DataTypes.AssetType.ERC721,
            Errors.INVALID_ASSET_TYPE
        );
        (bool isActive, , , , bool isPaused) = reserveCache
            .reserveConfiguration
            .getFlags();
        require(isActive, Errors.RESERVE_INACTIVE);
        require(!isPaused, Errors.RESERVE_PAUSED);
    }

    struct ValidateBorrowLocalVars {
        uint256 currentLtv;
        uint256 collateralNeededInBaseCurrency;
        uint256 userCollateralInBaseCurrency;
        uint256 userDebtInBaseCurrency;
        uint256 availableLiquidity;
        uint256 healthFactor;
        uint256 totalDebt;
        uint256 totalSupplyVariableDebt;
        uint256 reserveDecimals;
        uint256 borrowCap;
        uint256 amountInBaseCurrency;
        uint256 assetUnit;
        address siloedBorrowingAddress;
        bool isActive;
        bool isFrozen;
        bool isPaused;
        bool borrowingEnabled;
        bool stableRateBorrowingEnabled;
        bool siloedBorrowingEnabled;
    }

    /**
     * @notice Validates a borrow action.
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param params Additional params needed for the validation
     */
    function validateBorrow(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.ValidateBorrowParams memory params
    ) internal view {
        require(params.amount != 0, Errors.INVALID_AMOUNT);
        require(
            params.assetType == DataTypes.AssetType.ERC20,
            Errors.INVALID_ASSET_TYPE
        );
        ValidateBorrowLocalVars memory vars;

        (
            vars.isActive,
            vars.isFrozen,
            vars.borrowingEnabled,
            vars.stableRateBorrowingEnabled,
            vars.isPaused
        ) = params.reserveCache.reserveConfiguration.getFlags();

        require(vars.isActive, Errors.RESERVE_INACTIVE);
        require(!vars.isPaused, Errors.RESERVE_PAUSED);
        require(!vars.isFrozen, Errors.RESERVE_FROZEN);
        require(vars.borrowingEnabled, Errors.BORROWING_NOT_ENABLED);

        require(
            params.priceOracleSentinel == address(0) ||
                IPriceOracleSentinel(params.priceOracleSentinel)
                    .isBorrowAllowed(),
            Errors.PRICE_ORACLE_SENTINEL_CHECK_FAILED
        );

        //validate interest rate mode
        require(
            params.interestRateMode == DataTypes.InterestRateMode.VARIABLE ||
                params.interestRateMode == DataTypes.InterestRateMode.STABLE,
            Errors.INVALID_INTEREST_RATE_MODE_SELECTED
        );

        vars.reserveDecimals = params
            .reserveCache
            .reserveConfiguration
            .getDecimals();
        vars.borrowCap = params
            .reserveCache
            .reserveConfiguration
            .getBorrowCap();
        unchecked {
            vars.assetUnit = 10**vars.reserveDecimals;
        }

        if (vars.borrowCap != 0) {
            vars.totalSupplyVariableDebt = params
                .reserveCache
                .currScaledVariableDebt
                .rayMul(params.reserveCache.nextVariableBorrowIndex);

            vars.totalDebt =
                params.reserveCache.currTotalStableDebt +
                vars.totalSupplyVariableDebt +
                params.amount;

            unchecked {
                require(
                    vars.totalDebt <= vars.borrowCap * vars.assetUnit,
                    Errors.BORROW_CAP_EXCEEDED
                );
            }
        }

        (
            vars.userCollateralInBaseCurrency,
            ,
            vars.userDebtInBaseCurrency,
            vars.currentLtv,
            ,
            ,
            ,
            vars.healthFactor,
            ,

        ) = GenericLogic.calculateUserAccountData(
            reservesData,
            reservesList,
            DataTypes.CalculateUserAccountDataParams({
                userConfig: params.userConfig,
                reservesCount: params.reservesCount,
                user: params.userAddress,
                oracle: params.oracle
            })
        );

        require(
            vars.userCollateralInBaseCurrency != 0,
            Errors.COLLATERAL_BALANCE_IS_ZERO
        );
        require(vars.currentLtv != 0, Errors.LTV_VALIDATION_FAILED);

        require(
            vars.healthFactor > HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
            Errors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
        );

        vars.amountInBaseCurrency =
            IPriceOracleGetter(params.oracle).getAssetPrice(params.asset) *
            params.amount;
        unchecked {
            vars.amountInBaseCurrency /= vars.assetUnit;
        }

        //add the current already borrowed amount to the amount requested to calculate the total collateral needed.
        vars.collateralNeededInBaseCurrency = (vars.userDebtInBaseCurrency +
            vars.amountInBaseCurrency).percentDiv(vars.currentLtv); //LTV is calculated in percentage

        require(
            vars.collateralNeededInBaseCurrency <=
                vars.userCollateralInBaseCurrency,
            Errors.COLLATERAL_CANNOT_COVER_NEW_BORROW
        );

        /**
         * Following conditions need to be met if the user is borrowing at a stable rate:
         * 1. Reserve must be enabled for stable rate borrowing
         * 2. Users cannot borrow from the reserve if their collateral is (mostly) the same currency
         *    they are borrowing, to prevent abuses.
         * 3. Users will be able to borrow only a portion of the total available liquidity
         **/

        if (params.interestRateMode == DataTypes.InterestRateMode.STABLE) {
            //check if the borrow mode is stable and if stable rate borrowing is enabled on this reserve

            require(
                vars.stableRateBorrowingEnabled,
                Errors.STABLE_BORROWING_NOT_ENABLED
            );

            require(
                !params.userConfig.isUsingAsCollateral(
                    reservesData[params.asset].id
                ) ||
                    params.reserveCache.reserveConfiguration.getLtv() == 0 ||
                    params.amount >
                    IToken(params.reserveCache.xTokenAddress).balanceOf(
                        params.userAddress
                    ),
                Errors.COLLATERAL_SAME_AS_BORROWING_CURRENCY
            );

            vars.availableLiquidity = IToken(params.asset).balanceOf(
                params.reserveCache.xTokenAddress
            );

            //calculate the max available loan size in stable rate mode as a percentage of the
            //available liquidity
            uint256 maxLoanSizeStable = vars.availableLiquidity.percentMul(
                params.maxStableLoanPercent
            );

            require(
                params.amount <= maxLoanSizeStable,
                Errors.AMOUNT_BIGGER_THAN_MAX_LOAN_SIZE_STABLE
            );
        }
    }

    /**
     * @notice Validates a repay action.
     * @param reserveCache The cached data of the reserve
     * @param amountSent The amount sent for the repayment. Can be an actual value or uint(-1)
     * @param interestRateMode The interest rate mode of the debt being repaid
     * @param onBehalfOf The address of the user msg.sender is repaying for
     * @param stableDebt The borrow balance of the user
     * @param variableDebt The borrow balance of the user
     */
    function validateRepay(
        DataTypes.ReserveCache memory reserveCache,
        uint256 amountSent,
        DataTypes.InterestRateMode interestRateMode,
        address onBehalfOf,
        uint256 stableDebt,
        uint256 variableDebt
    ) internal view {
        require(amountSent != 0, Errors.INVALID_AMOUNT);
        require(
            amountSent != type(uint256).max || msg.sender == onBehalfOf,
            Errors.NO_EXPLICIT_AMOUNT_TO_REPAY_ON_BEHALF
        );

        (bool isActive, , , , bool isPaused) = reserveCache
            .reserveConfiguration
            .getFlags();
        require(isActive, Errors.RESERVE_INACTIVE);
        require(!isPaused, Errors.RESERVE_PAUSED);

        uint256 variableDebtPreviousIndex = IScaledBalanceToken(
            reserveCache.variableDebtTokenAddress
        ).getPreviousIndex(onBehalfOf);

        uint40 stableRatePreviousTimestamp = IStableDebtToken(
            reserveCache.stableDebtTokenAddress
        ).getUserLastUpdated(onBehalfOf);

        require(
            (stableRatePreviousTimestamp < uint40(block.timestamp) &&
                interestRateMode == DataTypes.InterestRateMode.STABLE) ||
                (variableDebtPreviousIndex <
                    reserveCache.nextVariableBorrowIndex &&
                    interestRateMode == DataTypes.InterestRateMode.VARIABLE),
            Errors.SAME_BLOCK_BORROW_REPAY
        );

        require(
            (stableDebt != 0 &&
                interestRateMode == DataTypes.InterestRateMode.STABLE) ||
                (variableDebt != 0 &&
                    interestRateMode == DataTypes.InterestRateMode.VARIABLE),
            Errors.NO_DEBT_OF_SELECTED_TYPE
        );
    }

    /**
     * @notice Validates a swap of borrow rate mode.
     * @param reserve The reserve state on which the user is swapping the rate
     * @param reserveCache The cached data of the reserve
     * @param userConfig The user reserves configuration
     * @param stableDebt The stable debt of the user
     * @param variableDebt The variable debt of the user
     * @param currentRateMode The rate mode of the debt being swapped
     */
    function validateSwapRateMode(
        DataTypes.ReserveData storage reserve,
        DataTypes.ReserveCache memory reserveCache,
        DataTypes.UserConfigurationMap storage userConfig,
        uint256 stableDebt,
        uint256 variableDebt,
        DataTypes.InterestRateMode currentRateMode
    ) internal view {
        (
            bool isActive,
            bool isFrozen,
            ,
            bool stableRateEnabled,
            bool isPaused
        ) = reserveCache.reserveConfiguration.getFlags();
        require(isActive, Errors.RESERVE_INACTIVE);
        require(!isPaused, Errors.RESERVE_PAUSED);
        require(!isFrozen, Errors.RESERVE_FROZEN);

        if (currentRateMode == DataTypes.InterestRateMode.STABLE) {
            require(stableDebt != 0, Errors.NO_OUTSTANDING_STABLE_DEBT);
        } else if (currentRateMode == DataTypes.InterestRateMode.VARIABLE) {
            require(variableDebt != 0, Errors.NO_OUTSTANDING_VARIABLE_DEBT);
            /**
             * user wants to swap to stable, before swapping we need to ensure that
             * 1. stable borrow rate is enabled on the reserve
             * 2. user is not trying to abuse the reserve by supplying
             * more collateral than he is borrowing, artificially lowering
             * the interest rate, borrowing at variable, and switching to stable
             **/
            require(stableRateEnabled, Errors.STABLE_BORROWING_NOT_ENABLED);

            require(
                !userConfig.isUsingAsCollateral(reserve.id) ||
                    reserveCache.reserveConfiguration.getLtv() == 0 ||
                    stableDebt + variableDebt >
                    IToken(reserveCache.xTokenAddress).balanceOf(msg.sender),
                Errors.COLLATERAL_SAME_AS_BORROWING_CURRENCY
            );
        } else {
            revert(Errors.INVALID_INTEREST_RATE_MODE_SELECTED);
        }
    }

    /**
     * @notice Validates a stable borrow rate rebalance action.
     * @dev Rebalancing is accepted when depositors are earning <= 90% of their earnings in pure supply/demand market (variable rate only)
     * For this to be the case, there has to be quite large stable debt with an interest rate below the current variable rate.
     * @param reserve The reserve state on which the user is getting rebalanced
     * @param reserveCache The cached state of the reserve
     * @param reserveAddress The address of the reserve
     */
    function validateRebalanceStableBorrowRate(
        DataTypes.ReserveData storage reserve,
        DataTypes.ReserveCache memory reserveCache,
        address reserveAddress
    ) internal view {
        (bool isActive, , , , bool isPaused) = reserveCache
            .reserveConfiguration
            .getFlags();
        require(isActive, Errors.RESERVE_INACTIVE);
        require(!isPaused, Errors.RESERVE_PAUSED);

        uint256 totalDebt = IToken(reserveCache.stableDebtTokenAddress)
            .totalSupply() +
            IToken(reserveCache.variableDebtTokenAddress).totalSupply();

        (
            uint256 liquidityRateVariableDebtOnly,
            ,

        ) = IReserveInterestRateStrategy(reserve.interestRateStrategyAddress)
                .calculateInterestRates(
                    DataTypes.CalculateInterestRatesParams({
                        liquidityAdded: 0,
                        liquidityTaken: 0,
                        totalStableDebt: 0,
                        totalVariableDebt: totalDebt,
                        averageStableBorrowRate: 0,
                        reserveFactor: reserveCache.reserveFactor,
                        reserve: reserveAddress,
                        xToken: reserveCache.xTokenAddress
                    })
                );

        require(
            reserveCache.currLiquidityRate <=
                liquidityRateVariableDebtOnly.percentMul(
                    REBALANCE_UP_LIQUIDITY_RATE_THRESHOLD
                ),
            Errors.INTEREST_RATE_REBALANCE_CONDITIONS_NOT_MET
        );
    }

    /**
     * @notice Validates the action of setting an asset as collateral.
     * @param reserveCache The cached data of the reserve
     * @param userBalance The balance of the user
     */
    function validateSetUseERC20AsCollateral(
        DataTypes.ReserveCache memory reserveCache,
        uint256 userBalance
    ) internal pure {
        require(
            reserveCache.assetType == DataTypes.AssetType.ERC20,
            Errors.INVALID_ASSET_TYPE
        );
        require(userBalance != 0, Errors.UNDERLYING_BALANCE_ZERO);

        (bool isActive, , , , bool isPaused) = reserveCache
            .reserveConfiguration
            .getFlags();
        require(isActive, Errors.RESERVE_INACTIVE);
        require(!isPaused, Errors.RESERVE_PAUSED);
    }

    function validateSetUseERC721AsCollateral(
        DataTypes.ReserveCache memory reserveCache
    ) internal pure {
        require(
            reserveCache.assetType == DataTypes.AssetType.ERC721,
            Errors.INVALID_ASSET_TYPE
        );
        (bool isActive, , , , bool isPaused) = reserveCache
            .reserveConfiguration
            .getFlags();
        require(isActive, Errors.RESERVE_INACTIVE);
        require(!isPaused, Errors.RESERVE_PAUSED);
    }

    struct ValidateLiquidationCallLocalVars {
        bool collateralReserveActive;
        bool collateralReservePaused;
        bool principalReserveActive;
        bool principalReservePaused;
        bool isCollateralEnabled;
    }

    struct ValidateAuctionLocalVars {
        bool collateralReserveActive;
        bool collateralReservePaused;
        bool isCollateralEnabled;
    }

    /**
     * @notice Validates the liquidation action.
     * @param userConfig The user configuration mapping
     * @param collateralReserve The reserve data of the collateral
     * @param params Additional parameters needed for the validation
     */
    function validateLiquidationCall(
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ReserveData storage collateralReserve,
        DataTypes.ValidateLiquidationCallParams memory params
    ) internal view {
        require(
            params.assetType == DataTypes.AssetType.ERC20,
            Errors.INVALID_ASSET_TYPE
        );
        ValidateLiquidationCallLocalVars memory vars;

        (
            vars.collateralReserveActive,
            ,
            ,
            ,
            vars.collateralReservePaused
        ) = collateralReserve.configuration.getFlags();

        (
            vars.principalReserveActive,
            ,
            ,
            ,
            vars.principalReservePaused
        ) = params.debtReserveCache.reserveConfiguration.getFlags();

        require(
            vars.collateralReserveActive && vars.principalReserveActive,
            Errors.RESERVE_INACTIVE
        );
        require(
            !vars.collateralReservePaused && !vars.principalReservePaused,
            Errors.RESERVE_PAUSED
        );

        require(
            params.priceOracleSentinel == address(0) ||
                params.healthFactor <
                MINIMUM_HEALTH_FACTOR_LIQUIDATION_THRESHOLD ||
                IPriceOracleSentinel(params.priceOracleSentinel)
                    .isLiquidationAllowed(),
            Errors.PRICE_ORACLE_SENTINEL_CHECK_FAILED
        );

        require(
            params.healthFactor < HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
            Errors.HEALTH_FACTOR_NOT_BELOW_THRESHOLD
        );

        vars.isCollateralEnabled =
            collateralReserve.configuration.getLiquidationThreshold() != 0 &&
            userConfig.isUsingAsCollateral(collateralReserve.id);

        //if collateral isn't enabled as collateral by user, it cannot be liquidated
        require(
            vars.isCollateralEnabled,
            Errors.COLLATERAL_CANNOT_BE_AUCTIONED_OR_LIQUIDATED
        );
        require(
            params.totalDebt != 0,
            Errors.SPECIFIED_CURRENCY_NOT_BORROWED_BY_USER
        );
    }

    /**
     * @notice Validates the liquidation action.
     * @param userConfig The user configuration mapping
     * @param collateralReserve The reserve data of the collateral
     * @param params Additional parameters needed for the validation
     */
    function validateERC721LiquidationCall(
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ReserveData storage collateralReserve,
        DataTypes.ValidateERC721LiquidationCallParams memory params
    ) internal view {
        require(
            params.assetType == DataTypes.AssetType.ERC721,
            Errors.INVALID_ASSET_TYPE
        );

        require(
            params.liquidator != params.borrower,
            Errors.LIQUIDATOR_CAN_NOT_BE_SELF
        );

        ValidateLiquidationCallLocalVars memory vars;

        (
            vars.collateralReserveActive,
            ,
            ,
            ,
            vars.collateralReservePaused
        ) = collateralReserve.configuration.getFlags();

        (
            vars.principalReserveActive,
            ,
            ,
            ,
            vars.principalReservePaused
        ) = params.debtReserveCache.reserveConfiguration.getFlags();

        require(
            vars.collateralReserveActive && vars.principalReserveActive,
            Errors.RESERVE_INACTIVE
        );
        require(
            !vars.collateralReservePaused && !vars.principalReservePaused,
            Errors.RESERVE_PAUSED
        );

        require(
            params.priceOracleSentinel == address(0) ||
                params.healthFactor <
                MINIMUM_HEALTH_FACTOR_LIQUIDATION_THRESHOLD ||
                IPriceOracleSentinel(params.priceOracleSentinel)
                    .isLiquidationAllowed(),
            Errors.PRICE_ORACLE_SENTINEL_CHECK_FAILED
        );

        if (!collateralReserve.auctionConfiguration.getAuctionEnabled()) {
            require(
                params.healthFactor < HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
                Errors.ERC721_HEALTH_FACTOR_NOT_BELOW_THRESHOLD
            );
        } else {
            require(
                params.healthFactor <
                    collateralReserve
                        .auctionConfiguration
                        .getAuctionRecoveryHealthFactor(),
                Errors.ERC721_HEALTH_FACTOR_NOT_BELOW_THRESHOLD
            );
            require(
                IAuctionableERC721(params.xTokenAddress).isAuctioned(
                    params.tokenId
                ),
                Errors.AUCTION_NOT_STARTED
            );
        }

        require(
            params.liquidationAmount >= params.collateralDiscountedPrice,
            Errors.LIQUIDATION_AMOUNT_NOT_ENOUGH
        );

        vars.isCollateralEnabled =
            collateralReserve.configuration.getLiquidationThreshold() != 0 &&
            userConfig.isUsingAsCollateral(collateralReserve.id) &&
            ICollaterizableERC721(params.xTokenAddress).isUsedAsCollateral(
                params.tokenId
            );

        //if collateral isn't enabled as collateral by user, it cannot be liquidated
        require(
            vars.isCollateralEnabled,
            Errors.COLLATERAL_CANNOT_BE_AUCTIONED_OR_LIQUIDATED
        );
        require(
            params.totalDebt != 0,
            Errors.SPECIFIED_CURRENCY_NOT_BORROWED_BY_USER
        );
    }

    /**
     * @notice Validates the health factor of a user.
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param userConfig The state of the user for the specific reserve
     * @param user The user to validate health factor of
     * @param reservesCount The number of available reserves
     * @param oracle The price oracle
     */
    function validateHealthFactor(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap memory userConfig,
        address user,
        uint256 reservesCount,
        address oracle
    ) internal view returns (uint256, bool) {
        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            uint256 healthFactor,
            ,
            bool hasZeroLtvCollateral
        ) = GenericLogic.calculateUserAccountData(
                reservesData,
                reservesList,
                DataTypes.CalculateUserAccountDataParams({
                    userConfig: userConfig,
                    reservesCount: reservesCount,
                    user: user,
                    oracle: oracle
                })
            );

        require(
            healthFactor >= HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
            Errors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
        );

        return (healthFactor, hasZeroLtvCollateral);
    }

    function validateStartAuction(
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ReserveData storage collateralReserve,
        DataTypes.ValidateAuctionParams memory params
    ) internal view {
        require(
            params.assetType == DataTypes.AssetType.ERC721,
            Errors.INVALID_ASSET_TYPE
        );
        require(
            IERC721(params.xTokenAddress).ownerOf(params.tokenId) ==
                params.user,
            Errors.NOT_THE_OWNER
        );

        ValidateAuctionLocalVars memory vars;

        DataTypes.ReserveConfigurationMap
            memory collateralConfiguration = collateralReserve.configuration;
        (
            vars.collateralReserveActive,
            ,
            ,
            ,
            vars.collateralReservePaused
        ) = collateralConfiguration.getFlags();

        require(vars.collateralReserveActive, Errors.RESERVE_INACTIVE);
        require(!vars.collateralReservePaused, Errors.RESERVE_PAUSED);

        require(
            collateralReserve.auctionConfiguration.getAuctionEnabled(),
            Errors.AUCTION_NOT_ENABLED
        );
        require(
            !IAuctionableERC721(params.xTokenAddress).isAuctioned(
                params.tokenId
            ),
            Errors.AUCTION_ALREADY_STARTED
        );

        require(
            params.healthFactor < HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
            Errors.ERC721_HEALTH_FACTOR_NOT_BELOW_THRESHOLD
        );

        vars.isCollateralEnabled =
            collateralConfiguration.getLiquidationThreshold() != 0 &&
            userConfig.isUsingAsCollateral(collateralReserve.id) &&
            ICollaterizableERC721(params.xTokenAddress).isUsedAsCollateral(
                params.tokenId
            );

        //if collateral isn't enabled as collateral by user, it cannot be auctioned
        require(
            vars.isCollateralEnabled,
            Errors.COLLATERAL_CANNOT_BE_AUCTIONED_OR_LIQUIDATED
        );
    }

    function validateEndAuction(
        DataTypes.ReserveData storage collateralReserve,
        DataTypes.ValidateAuctionParams memory params
    ) internal view {
        require(
            params.assetType == DataTypes.AssetType.ERC721,
            Errors.INVALID_ASSET_TYPE
        );
        require(
            IERC721(params.xTokenAddress).ownerOf(params.tokenId) ==
                params.user,
            Errors.NOT_THE_OWNER
        );

        ValidateAuctionLocalVars memory vars;

        (
            vars.collateralReserveActive,
            ,
            ,
            ,
            vars.collateralReservePaused
        ) = collateralReserve.configuration.getFlags();

        require(vars.collateralReserveActive, Errors.RESERVE_INACTIVE);
        require(!vars.collateralReservePaused, Errors.RESERVE_PAUSED);
        require(
            IAuctionableERC721(params.xTokenAddress).isAuctioned(
                params.tokenId
            ),
            Errors.AUCTION_NOT_STARTED
        );

        uint256 recoveryHealthFactor = collateralReserve
            .auctionConfiguration
            .getAuctionRecoveryHealthFactor();

        require(
            recoveryHealthFactor != 0 &&
                params.healthFactor >= recoveryHealthFactor,
            Errors.ERC721_HEALTH_FACTOR_NOT_ABOVE_THRESHOLD
        );
    }

    /**
     * @notice Validates the health factor of a user and the ltv of the asset being withdrawn.
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param userConfig The state of the user for the specific reserve
     * @param asset The asset for which the ltv will be validated
     * @param from The user from which the xTokens are being transferred
     * @param reservesCount The number of available reserves
     * @param oracle The price oracle
     */
    function validateHFAndLtv(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap memory userConfig,
        address asset,
        address from,
        uint256 reservesCount,
        address oracle
    ) internal view {
        DataTypes.ReserveData memory reserve = reservesData[asset];

        (, bool hasZeroLtvCollateral) = validateHealthFactor(
            reservesData,
            reservesList,
            userConfig,
            from,
            reservesCount,
            oracle
        );

        require(
            !hasZeroLtvCollateral || reserve.configuration.getLtv() == 0,
            Errors.LTV_VALIDATION_FAILED
        );
    }

    /**
     * @notice Validates a transfer action.
     * @param reserve The reserve object
     */
    function validateTransfer(DataTypes.ReserveData storage reserve)
        internal
        view
    {
        require(!reserve.configuration.getPaused(), Errors.RESERVE_PAUSED);
    }

    /**
     * @notice Validates a drop reserve action.
     * @param reservesList The addresses of all the active reserves
     * @param reserve The reserve object
     * @param asset The address of the reserve's underlying asset
     **/
    function validateDropReserve(
        mapping(uint256 => address) storage reservesList,
        DataTypes.ReserveData storage reserve,
        address asset
    ) internal view {
        require(asset != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        require(
            reserve.id != 0 || reservesList[0] == asset,
            Errors.ASSET_NOT_LISTED
        );
        require(
            IToken(reserve.stableDebtTokenAddress).totalSupply() == 0,
            Errors.STABLE_DEBT_NOT_ZERO
        );
        require(
            IToken(reserve.variableDebtTokenAddress).totalSupply() == 0,
            Errors.VARIABLE_DEBT_SUPPLY_NOT_ZERO
        );
        require(
            IToken(reserve.xTokenAddress).totalSupply() == 0,
            Errors.XTOKEN_SUPPLY_NOT_ZERO
        );
    }

    /**
     * @notice Validates a flash claim.
     * @param reserve The reserve object
     * @param params The flash claim params
     */
    function validateFlashClaim(
        DataTypes.ReserveData storage reserve,
        DataTypes.ExecuteFlashClaimParams memory params
    ) internal view {
        require(
            reserve.assetType == DataTypes.AssetType.ERC721,
            Errors.INVALID_ASSET_TYPE
        );
        require(
            params.receiverAddress != address(0),
            Errors.ZERO_ADDRESS_NOT_VALID
        );

        // only token owner can do flash claim
        for (uint256 i = 0; i < params.nftTokenIds.length; i++) {
            require(
                INToken(reserve.xTokenAddress).ownerOf(params.nftTokenIds[i]) ==
                    msg.sender,
                Errors.NOT_THE_OWNER
            );
        }
    }

    /**
     * @notice Validates a flashloan action.
     * @param reserve The state of the reserve
     */
    function validateFlashloanSimple(DataTypes.ReserveData storage reserve)
        internal
        view
    {
        DataTypes.ReserveConfigurationMap memory configuration = reserve
            .configuration;
        require(!configuration.getPaused(), Errors.RESERVE_PAUSED);
        require(configuration.getActive(), Errors.RESERVE_INACTIVE);
    }

    function validateBuyWithCredit(
        DataTypes.ExecuteMarketplaceParams memory params
    ) internal view {
        require(!params.marketplace.paused, Errors.MARKETPLACE_PAUSED);
    }

    function validateAcceptBidWithCredit(
        DataTypes.ExecuteMarketplaceParams memory params
    ) internal view {
        require(!params.marketplace.paused, Errors.MARKETPLACE_PAUSED);
        require(
            keccak256(abi.encodePacked(params.orderInfo.id)) ==
                keccak256(abi.encodePacked(params.credit.orderId)),
            Errors.CREDIT_DOES_NOT_MATCH_ORDER
        );
        require(
            verifyCreditSignature(
                params.credit,
                params.orderInfo.maker,
                params.credit.v,
                params.credit.r,
                params.credit.s
            ),
            Errors.INVALID_CREDIT_SIGNATURE
        );
    }

    function verifyCreditSignature(
        DataTypes.Credit memory credit,
        address signer,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) private view returns (bool) {
        return
            SignatureChecker.verify(
                hashCredit(credit),
                signer,
                v,
                r,
                s,
                getDomainSeparator()
            );
    }

    function hashCredit(DataTypes.Credit memory credit)
        private
        pure
        returns (bytes32)
    {
        bytes32 typeHash = keccak256(
            abi.encodePacked(
                "Credit(address token,uint256 amount,bytes orderId)"
            )
        );

        // https://github.com/ethereum/EIPs/blob/master/EIPS/eip-712.md#definition-of-encodedata
        return
            keccak256(
                abi.encode(
                    typeHash,
                    credit.token,
                    credit.amount,
                    keccak256(abi.encodePacked(credit.orderId))
                )
            );
    }

    function getDomainSeparator() internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f, // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
                    0x88d989289235fb06c18e3c2f7ea914f41f773e86fb0073d632539f566f4df353, // keccak256("ParaSpace")
                    0x722c0e0c80487266e8c6a45e3a1a803aab23378a9c32e6ebe029d4fad7bfc965, // keccak256(bytes("1.1")),
                    block.chainid,
                    address(this)
                )
            );
    }
}
