// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IERC20} from "../../../dependencies/openzeppelin/contracts//IERC20.sol";
import {GPv2SafeERC20} from "../../../dependencies/gnosis/contracts/GPv2SafeERC20.sol";
import {PercentageMath} from "../../libraries/math/PercentageMath.sol";
import {WadRayMath} from "../../libraries/math/WadRayMath.sol";
import {Helpers} from "../../libraries/helpers/Helpers.sol";
import {DataTypes} from "../../libraries/types/DataTypes.sol";
import {ReserveLogic} from "./ReserveLogic.sol";
import {SupplyLogic} from "./SupplyLogic.sol";
import {ValidationLogic} from "./ValidationLogic.sol";
import {GenericLogic} from "./GenericLogic.sol";
import {UserConfiguration} from "../../libraries/configuration/UserConfiguration.sol";
import {ReserveConfiguration} from "../../libraries/configuration/ReserveConfiguration.sol";
import {IPToken} from "../../../interfaces/IPToken.sol";
import {ICollaterizableERC721} from "../../../interfaces/ICollaterizableERC721.sol";
import {IAuctionableERC721} from "../../../interfaces/IAuctionableERC721.sol";
import {INToken} from "../../../interfaces/INToken.sol";
import {PRBMath} from "../../../dependencies/math/PRBMath.sol";
import {PRBMathUD60x18} from "../../../dependencies/math/PRBMathUD60x18.sol";
import {IReserveAuctionStrategy} from "../../../interfaces/IReserveAuctionStrategy.sol";
import {IVariableDebtToken} from "../../../interfaces/IVariableDebtToken.sol";
import {IPriceOracleGetter} from "../../../interfaces/IPriceOracleGetter.sol";

/**
 * @title LiquidationLogic library
 *
 * @notice Implements actions involving management of collateral in the protocol, the main one being the liquidations
 **/
library LiquidationLogic {
    using PercentageMath for uint256;
    using ReserveLogic for DataTypes.ReserveCache;
    using ReserveLogic for DataTypes.ReserveData;
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using PRBMathUD60x18 for uint256;
    using GPv2SafeERC20 for IERC20;

    // See `IPool` for descriptions
    event ReserveUsedAsCollateralEnabled(
        address indexed reserve,
        address indexed user
    );
    event ReserveUsedAsCollateralDisabled(
        address indexed reserve,
        address indexed user
    );
    event LiquidationCall(
        address indexed collateralAsset,
        address indexed liquidationAsset,
        address indexed user,
        uint256 liquidationAmount,
        uint256 liquidatedCollateralAmount,
        address liquidator,
        bool receivePToken
    );
    event ERC721LiquidationCall(
        address indexed collateralAsset,
        address indexed liquidationAsset,
        address indexed user,
        uint256 liquidationAmount,
        uint256 liquidatedCollateralTokenId,
        address liquidator,
        bool receiveNToken
    );
    event AuctionStarted(
        address indexed user,
        address indexed collateralAsset,
        uint256 indexed collateralTokenId
    );
    event AuctionEnded(
        address indexed user,
        address indexed collateralAsset,
        uint256 indexed collateralTokenId
    );

    uint256 private constant BASE_CURRENCY_DECIMALS = 18;

    struct LiquidationCallLocalVars {
        address liquidator;
        //userCollateralBalance from collateralReserve
        uint256 userCollateralBalance;
        //userGlobalCollateralBalance from all reserves
        uint256 userGlobalCollateralBalance;
        //userTotalDebt from liquadationReserve
        uint256 userTotalDebt;
        //userGlobalDebt from all reserves
        uint256 userGlobalDebt;
        //actualDebt allowed to liquidate
        uint256 actualDebtToLiquidate;
        //actualLiquidationAmount to repay based on collateral
        uint256 actualLiquidationAmount;
        //actualCollateral allowed to liquidate
        uint256 actualCollateralToLiquidate;
        //liquidationBonusRate from reserve config
        uint256 liquidationBonus;
        uint256 healthFactor;
        uint256 liquidationProtocolFeeAmount;
        address collateralPriceSource;
        address debtPriceSource;
        address collateralXToken;
        bool isLiquidationAssetBorrowed;
        DataTypes.ReserveCache liquidationAssetReserveCache;
        DataTypes.AssetType assetType;
        bool auctionEnabled;
    }

    struct AuctionLocalVars {
        uint256 erc721HealthFactor;
        address collateralXToken;
        DataTypes.AssetType assetType;
    }

    function executeStartAuction(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        mapping(address => DataTypes.UserConfigurationMap) storage usersConfig,
        DataTypes.ExecuteAuctionParams memory params
    ) external {
        AuctionLocalVars memory vars;
        DataTypes.ReserveData storage collateralReserve = reservesData[
            params.collateralAsset
        ];

        vars.collateralXToken = collateralReserve.xTokenAddress;
        DataTypes.UserConfigurationMap storage userConfig = usersConfig[
            params.user
        ];

        (, , , , , , , , vars.erc721HealthFactor, ) = GenericLogic
            .calculateUserAccountData(
                reservesData,
                reservesList,
                DataTypes.CalculateUserAccountDataParams({
                    userConfig: userConfig,
                    reservesCount: params.reservesCount,
                    user: params.user,
                    oracle: params.priceOracle
                })
            );

        ValidationLogic.validateStartAuction(
            userConfig,
            collateralReserve,
            DataTypes.ValidateAuctionParams({
                user: params.user,
                auctionRecoveryHealthFactor: params.auctionRecoveryHealthFactor,
                erc721HealthFactor: vars.erc721HealthFactor,
                collateralAsset: params.collateralAsset,
                tokenId: params.collateralTokenId,
                xTokenAddress: vars.collateralXToken
            })
        );

        IAuctionableERC721(vars.collateralXToken).startAuction(
            params.collateralTokenId
        );

        emit AuctionStarted(
            params.user,
            params.collateralAsset,
            params.collateralTokenId
        );
    }

    function executeEndAuction(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        mapping(address => DataTypes.UserConfigurationMap) storage usersConfig,
        DataTypes.ExecuteAuctionParams memory params
    ) external {
        AuctionLocalVars memory vars;
        DataTypes.ReserveData storage collateralReserve = reservesData[
            params.collateralAsset
        ];
        vars.collateralXToken = collateralReserve.xTokenAddress;
        DataTypes.UserConfigurationMap storage userConfig = usersConfig[
            params.user
        ];

        (, , , , , , , , vars.erc721HealthFactor, ) = GenericLogic
            .calculateUserAccountData(
                reservesData,
                reservesList,
                DataTypes.CalculateUserAccountDataParams({
                    userConfig: userConfig,
                    reservesCount: params.reservesCount,
                    user: params.user,
                    oracle: params.priceOracle
                })
            );

        ValidationLogic.validateEndAuction(
            collateralReserve,
            DataTypes.ValidateAuctionParams({
                user: params.user,
                auctionRecoveryHealthFactor: params.auctionRecoveryHealthFactor,
                erc721HealthFactor: vars.erc721HealthFactor,
                collateralAsset: params.collateralAsset,
                tokenId: params.collateralTokenId,
                xTokenAddress: vars.collateralXToken
            })
        );

        IAuctionableERC721(vars.collateralXToken).endAuction(
            params.collateralTokenId
        );

        emit AuctionEnded(
            params.user,
            params.collateralAsset,
            params.collateralTokenId
        );
    }

    /**
     * @notice Function to liquidate a position if its Health Factor drops below 1. The caller (liquidator)
     * covers `liquidationAmount` amount of debt of the user getting liquidated, and receives
     * a proportional amount of the `collateralAsset` plus a bonus to cover market risk
     * @dev Emits the `LiquidationCall()` event
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param usersConfig The users configuration mapping that track the supplied/borrowed assets
     * @param params The additional parameters needed to execute the liquidation function
     **/
    function executeLiquidationCall(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        mapping(address => DataTypes.UserConfigurationMap) storage usersConfig,
        DataTypes.ExecuteLiquidationCallParams memory params
    ) external {
        LiquidationCallLocalVars memory vars;

        DataTypes.ReserveData storage collateralReserve = reservesData[
            params.collateralAsset
        ];
        DataTypes.ReserveData storage liquidationAssetReserve = reservesData[
            params.liquidationAsset
        ];
        DataTypes.UserConfigurationMap storage userConfig = usersConfig[
            params.user
        ];
        vars.liquidationAssetReserveCache = liquidationAssetReserve.cache();
        liquidationAssetReserve.updateState(vars.liquidationAssetReserveCache);

        (, , , , , , , vars.healthFactor, , ) = GenericLogic
            .calculateUserAccountData(
                reservesData,
                reservesList,
                DataTypes.CalculateUserAccountDataParams({
                    userConfig: userConfig,
                    reservesCount: params.reservesCount,
                    user: params.user,
                    oracle: params.priceOracle
                })
            );

        (vars.userTotalDebt, vars.actualDebtToLiquidate) = _calculateDebt(
            vars.liquidationAssetReserveCache,
            params
        );

        ValidationLogic.validateLiquidationCall(
            userConfig,
            collateralReserve,
            DataTypes.ValidateLiquidationCallParams({
                liquidationAssetReserveCache: vars.liquidationAssetReserveCache,
                totalDebt: vars.userTotalDebt,
                healthFactor: vars.healthFactor,
                priceOracleSentinel: params.priceOracleSentinel
            })
        );

        (
            vars.collateralXToken,
            vars.collateralPriceSource,
            vars.debtPriceSource,
            vars.liquidationBonus
        ) = _getConfigurationData(collateralReserve, params);

        vars.userCollateralBalance = IPToken(vars.collateralXToken).balanceOf(
            params.user
        );

        (
            vars.actualCollateralToLiquidate,
            vars.actualDebtToLiquidate,
            vars.liquidationProtocolFeeAmount
        ) = _calculateERC20LiquidationParameters(
            collateralReserve,
            vars.liquidationAssetReserveCache,
            vars.collateralPriceSource,
            vars.debtPriceSource,
            vars.actualDebtToLiquidate,
            vars.userCollateralBalance,
            vars.liquidationBonus,
            IPriceOracleGetter(params.priceOracle)
        );

        if (vars.userTotalDebt == vars.actualDebtToLiquidate) {
            userConfig.setBorrowing(liquidationAssetReserve.id, false);
        }

        liquidationAssetReserve.updateInterestRates(
            vars.liquidationAssetReserveCache,
            params.liquidationAsset,
            vars.actualDebtToLiquidate,
            0
        );

        vars.liquidator = msg.sender;

        // Transfer fee to treasury if it is non-zero
        if (vars.liquidationProtocolFeeAmount != 0) {
            IPToken(vars.collateralXToken).transferOnLiquidation(
                params.user,
                IPToken(vars.collateralXToken).RESERVE_TREASURY_ADDRESS(),
                vars.liquidationProtocolFeeAmount
            );
        }

        // If the collateral being liquidated is equal to the user balance,
        // we set the currency as not being used as collateral anymore
        if (vars.actualCollateralToLiquidate == vars.userCollateralBalance) {
            userConfig.setUsingAsCollateral(collateralReserve.id, false);
            emit ReserveUsedAsCollateralDisabled(
                params.collateralAsset,
                params.user
            );
        }

        // Transfers the debt asset being repaid to the xToken, where the liquidity is kept
        IERC20(params.liquidationAsset).safeTransferFrom(
            vars.liquidator,
            vars.liquidationAssetReserveCache.xTokenAddress,
            vars.actualDebtToLiquidate
        );

        IPToken(vars.liquidationAssetReserveCache.xTokenAddress)
            .handleRepayment(vars.liquidator, vars.actualDebtToLiquidate);

        _burnDebtTokens(params, vars);

        if (params.receiveXToken) {
            _liquidatePTokens(usersConfig, collateralReserve, params, vars);
        } else {
            _burnCollateralPTokens(collateralReserve, params, vars);
        }

        emit LiquidationCall(
            params.collateralAsset,
            params.liquidationAsset,
            params.user,
            vars.actualDebtToLiquidate,
            vars.actualCollateralToLiquidate,
            vars.liquidator,
            params.receiveXToken
        );
    }

    /**
     * @notice Function to liquidate an ERC721 of a position if its Health Factor drops below 1. The caller (liquidator)
     * covers `liquidationAmount` amount of debt of the user getting liquidated, and receives
     * a proportional tokenId of the `collateralAsset` minus a bonus to cover market risk
     * @dev Emits the `ERC721LiquidationCall()` event
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param usersConfig The users configuration mapping that track the supplied/borrowed assets
     * @param params The additional parameters needed to execute the liquidation function
     **/
    function executeERC721LiquidationCall(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        mapping(address => DataTypes.UserConfigurationMap) storage usersConfig,
        DataTypes.ExecuteLiquidationCallParams memory params
    ) external {
        LiquidationCallLocalVars memory vars;

        DataTypes.ReserveData storage collateralReserve = reservesData[
            params.collateralAsset
        ];

        DataTypes.ReserveData storage liquidationAssetReserve = reservesData[
            params.liquidationAsset
        ];
        DataTypes.UserConfigurationMap storage userConfig = usersConfig[
            params.user
        ];
        uint16 liquidationAssetReserveId = liquidationAssetReserve.id;
        vars.liquidationAssetReserveCache = liquidationAssetReserve.cache();

        vars.auctionEnabled =
            collateralReserve.auctionStrategyAddress != address(0);

        liquidationAssetReserve.updateState(vars.liquidationAssetReserveCache);
        (
            vars.userGlobalCollateralBalance,
            ,
            vars.userGlobalDebt, //in base currency
            ,
            ,
            ,
            ,
            ,
            vars.healthFactor,

        ) = GenericLogic.calculateUserAccountData(
            reservesData,
            reservesList,
            DataTypes.CalculateUserAccountDataParams({
                userConfig: userConfig,
                reservesCount: params.reservesCount,
                user: params.user,
                oracle: params.priceOracle
            })
        );

        vars.isLiquidationAssetBorrowed = userConfig.isBorrowing(
            liquidationAssetReserveId
        );

        if (vars.isLiquidationAssetBorrowed) {
            (vars.userTotalDebt, vars.actualDebtToLiquidate) = _calculateDebt(
                vars.liquidationAssetReserveCache,
                params
            );
        }

        (
            vars.collateralXToken,
            vars.collateralPriceSource,
            vars.debtPriceSource,
            vars.liquidationBonus
        ) = _getConfigurationData(collateralReserve, params);

        if (!vars.isLiquidationAssetBorrowed || vars.auctionEnabled) {
            vars.liquidationBonus = PercentageMath.PERCENTAGE_FACTOR;
        }

        vars.userCollateralBalance = ICollaterizableERC721(
            vars.collateralXToken
        ).collaterizedBalanceOf(params.user);

        // vars.userGlobalDebt is set twice to get amount here
        (
            vars.actualLiquidationAmount,
            vars.liquidationProtocolFeeAmount,
            vars.userGlobalDebt,

        ) = _calculateERC721LiquidationParameters(
            collateralReserve,
            vars.liquidationAssetReserveCache,
            vars.collateralPriceSource,
            vars.debtPriceSource,
            vars.userGlobalDebt,
            vars.actualDebtToLiquidate,
            vars.liquidationBonus,
            params.collateralTokenId,
            vars.auctionEnabled,
            IPriceOracleGetter(params.priceOracle)
        );

        vars.liquidator = msg.sender;
        ValidationLogic.validateERC721LiquidationCall(
            userConfig,
            collateralReserve,
            DataTypes.ValidateERC721LiquidationCallParams({
                liquidationAssetReserveCache: vars.liquidationAssetReserveCache,
                liquidator: vars.liquidator,
                borrower: params.user,
                globalDebt: vars.userGlobalDebt,
                actualLiquidationAmount: vars.actualLiquidationAmount,
                liquidationAmount: params.liquidationAmount,
                healthFactor: vars.healthFactor,
                priceOracleSentinel: params.priceOracleSentinel,
                tokenId: params.collateralTokenId,
                xTokenAddress: vars.collateralXToken,
                auctionEnabled: vars.auctionEnabled,
                auctionRecoveryHealthFactor: params.auctionRecoveryHealthFactor
            })
        );

        if (vars.auctionEnabled) {
            IAuctionableERC721(collateralReserve.xTokenAddress).endAuction(
                params.collateralTokenId
            );
            emit AuctionEnded(
                params.user,
                params.collateralAsset,
                params.collateralTokenId
            );
        }

        uint256 debtCanBeCovered = vars.actualLiquidationAmount -
            vars.liquidationProtocolFeeAmount;
        // Debt to be covered for the nft = discounted price for NFT, not including protocol fees
        // actualLiquidationAmount includes the fees by default so you need to subtract them

        if (debtCanBeCovered > vars.actualDebtToLiquidate) {
            // the actualLiquidationAmount will never be greater than the amount the liquidator is passing in
            // require(params.liquidationAmount >= params.actualLiquidationAmount) - line 669 of ValidationLogic.sol
            // there will always be excess if actualLiquidationAmount > amount needed to liquidate
            // vars.actualDebtToLiquidate = The actual debt that is getting liquidated.
            // If liquidation amount passed in by the liquidator is greater then the total user debt,
            // then use the user total debt as the actual debt getting liquidated.
            // If the user total debt is greater than the liquidation amount getting passed in by the liquidator,
            // then use the liquidation amount the user is passing in.
            if (vars.userGlobalDebt > vars.actualDebtToLiquidate) {
                // userGlobalDebt = debt across all positions (ie. if there are multiple positions)
                // if the global debt > the actual debt that is getting liquidated then the excess amount goes to pay protocol
                SupplyLogic.executeSupply(
                    reservesData,
                    userConfig,
                    DataTypes.ExecuteSupplyParams({
                        asset: params.liquidationAsset,
                        amount: debtCanBeCovered - vars.actualDebtToLiquidate,
                        onBehalfOf: params.user,
                        referralCode: 0
                    })
                );

                if (
                    !userConfig.isUsingAsCollateral(liquidationAssetReserveId)
                ) {
                    userConfig.setUsingAsCollateral(
                        liquidationAssetReserveId,
                        true
                    );
                    emit ReserveUsedAsCollateralEnabled(
                        params.liquidationAsset,
                        params.user
                    );
                }
            } else {
                // if the actual debt that is getting liquidated > user global debt then pay back excess to user
                IERC20(params.liquidationAsset).safeTransferFrom(
                    vars.liquidator,
                    params.user,
                    debtCanBeCovered - vars.actualDebtToLiquidate
                );
            }
        } else {
            // if the actual debt that is getting liquidated > discounted price then there is no excess amount
            // update the actual debt that is getting liquidated to the discounted price of the nft
            vars.actualDebtToLiquidate = debtCanBeCovered;
        }

        if (vars.userTotalDebt == vars.actualDebtToLiquidate) {
            userConfig.setBorrowing(liquidationAssetReserve.id, false);
        }

        // Transfer fee to treasury if it is non-zero
        if (vars.liquidationProtocolFeeAmount != 0) {
            IERC20(params.liquidationAsset).safeTransferFrom(
                vars.liquidator,
                IPToken(vars.liquidationAssetReserveCache.xTokenAddress)
                    .RESERVE_TREASURY_ADDRESS(),
                vars.liquidationProtocolFeeAmount
            );
        }

        // If the collateral being liquidated is equal to the user balance,
        // we set the currency as not being used as collateral anymore
        if (vars.userCollateralBalance == 1) {
            userConfig.setUsingAsCollateral(collateralReserve.id, false);
            emit ReserveUsedAsCollateralDisabled(
                params.collateralAsset,
                params.user
            );
        }

        if (vars.actualDebtToLiquidate != 0) {
            liquidationAssetReserve.updateInterestRates(
                vars.liquidationAssetReserveCache,
                params.liquidationAsset,
                vars.actualDebtToLiquidate,
                0
            );
            IERC20(params.liquidationAsset).safeTransferFrom(
                vars.liquidator,
                vars.liquidationAssetReserveCache.xTokenAddress,
                vars.actualDebtToLiquidate
            );
            _burnDebtTokens(params, vars);
        }

        if (params.receiveXToken) {
            INToken(vars.collateralXToken).transferOnLiquidation(
                params.user,
                vars.liquidator,
                params.collateralTokenId
            );
        } else {
            _burnCollateralNTokens(params, vars);
        }

        emit ERC721LiquidationCall(
            params.collateralAsset,
            params.liquidationAsset,
            params.user,
            vars.actualDebtToLiquidate,
            params.collateralTokenId,
            vars.liquidator,
            params.receiveXToken
        );
    }

    /**
     * @notice Burns the collateral xTokens and transfers the underlying to the liquidator.
     * @dev   The function also updates the state and the interest rate of the collateral reserve.
     * @param collateralReserve The data of the collateral reserve
     * @param params The additional parameters needed to execute the liquidation function
     * @param vars The executeLiquidationCall() function local vars
     */
    function _burnCollateralPTokens(
        DataTypes.ReserveData storage collateralReserve,
        DataTypes.ExecuteLiquidationCallParams memory params,
        LiquidationCallLocalVars memory vars
    ) internal {
        DataTypes.ReserveCache memory collateralReserveCache = collateralReserve
            .cache();
        collateralReserve.updateState(collateralReserveCache);
        collateralReserve.updateInterestRates(
            collateralReserveCache,
            params.collateralAsset,
            0,
            vars.actualCollateralToLiquidate
        );

        // Burn the equivalent amount of xToken, sending the underlying to the liquidator
        IPToken(vars.collateralXToken).burn(
            params.user,
            vars.liquidator,
            vars.actualCollateralToLiquidate,
            collateralReserveCache.nextLiquidityIndex
        );
    }

    /**
     * @notice Burns the collateral xTokens and transfers the underlying to the liquidator.
     * @dev   The function also updates the state and the interest rate of the collateral reserve.
     * @param params The additional parameters needed to execute the liquidation function
     * @param vars The executeLiquidationCall() function local vars
     */
    function _burnCollateralNTokens(
        DataTypes.ExecuteLiquidationCallParams memory params,
        LiquidationCallLocalVars memory vars
    ) internal {
        // Burn the equivalent amount of xToken, sending the underlying to the liquidator
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = params.collateralTokenId;
        INToken(vars.collateralXToken).burn(
            params.user,
            vars.liquidator,
            tokenIds
        );
    }

    /**
     * @notice Liquidates the user xTokens by transferring them to the liquidator.
     * @dev   The function also checks the state of the liquidator and activates the xToken as collateral
     *        as in standard transfers if the isolation mode constraints are respected.
     * @param usersConfig The users configuration mapping that track the supplied/borrowed assets
     * @param collateralReserve The data of the collateral reserve
     * @param params The additional parameters needed to execute the liquidation function
     * @param vars The executeLiquidationCall() function local vars
     */
    function _liquidatePTokens(
        mapping(address => DataTypes.UserConfigurationMap) storage usersConfig,
        DataTypes.ReserveData storage collateralReserve,
        DataTypes.ExecuteLiquidationCallParams memory params,
        LiquidationCallLocalVars memory vars
    ) internal {
        IPToken pToken = IPToken(vars.collateralXToken);
        uint256 liquidatorPreviousPTokenBalance = pToken.balanceOf(
            vars.liquidator
        );
        pToken.transferOnLiquidation(
            params.user,
            vars.liquidator,
            vars.actualCollateralToLiquidate
        );

        if (liquidatorPreviousPTokenBalance == 0) {
            DataTypes.UserConfigurationMap
                storage liquidatorConfig = usersConfig[vars.liquidator];

            liquidatorConfig.setUsingAsCollateral(collateralReserve.id, true);
            emit ReserveUsedAsCollateralEnabled(
                params.collateralAsset,
                vars.liquidator
            );
        }
    }

    /**
     * @notice Burns the debt tokens of the user up to the amount being repaid by the liquidator.
     * @dev The function alters the `liquidationAssetReserveCache` state in `vars` to update the debt related data.
     * @param params The additional parameters needed to execute the liquidation function
     * @param vars the executeLiquidationCall() function local vars
     */
    function _burnDebtTokens(
        DataTypes.ExecuteLiquidationCallParams memory params,
        LiquidationCallLocalVars memory vars
    ) internal {
        if (vars.userTotalDebt >= vars.actualDebtToLiquidate) {
            vars
                .liquidationAssetReserveCache
                .nextScaledVariableDebt = IVariableDebtToken(
                vars.liquidationAssetReserveCache.variableDebtTokenAddress
            ).burn(
                    params.user,
                    vars.actualDebtToLiquidate,
                    vars.liquidationAssetReserveCache.nextVariableBorrowIndex
                );
        } else {
            // If the user doesn't have variable debt, no need to try to burn variable debt tokens
            if (vars.userTotalDebt != 0) {
                vars
                    .liquidationAssetReserveCache
                    .nextScaledVariableDebt = IVariableDebtToken(
                    vars.liquidationAssetReserveCache.variableDebtTokenAddress
                ).burn(
                        params.user,
                        vars.userTotalDebt,
                        vars
                            .liquidationAssetReserveCache
                            .nextVariableBorrowIndex
                    );
            }
        }
    }

    /**
     * @notice Calculates the total debt of the user and the actual amount to liquidate depending on the health factor
     * and corresponding close factor. we are always using max closing factor in this version
     * @param liquidationAssetReserveCache The reserve cache data object of the debt reserve
     * @param params The additional parameters needed to execute the liquidation function
     * @return The total debt of the user
     * @return The actual debt that is getting liquidated. If liquidation amount passed in by the liquidator is greater then the total user debt, then use the user total debt as the actual debt getting liquidated. If the user total debt is greater than the liquidation amount getting passed in by the liquidator, then use the liquidation amount the user is passing in.
     */
    function _calculateDebt(
        DataTypes.ReserveCache memory liquidationAssetReserveCache,
        DataTypes.ExecuteLiquidationCallParams memory params
    ) internal view returns (uint256, uint256) {
        // userTotalDebt = debt of the borrowed position needed for liquidation
        uint256 userTotalDebt = Helpers.getUserCurrentDebt(
            params.user,
            liquidationAssetReserveCache
        );

        uint256 actualDebtToLiquidate = params.liquidationAmount > userTotalDebt
            ? userTotalDebt
            : params.liquidationAmount;

        return (userTotalDebt, actualDebtToLiquidate);
    }

    /**
     * @notice Returns the configuration data for the debt and the collateral reserves.
     * @param collateralReserve The data of the collateral reserve
     * @param params The additional parameters needed to execute the liquidation function
     * @return The collateral xToken
     * @return The address to use as price source for the collateral
     * @return The address to use as price source for the debt
     * @return The liquidation bonus to apply to the collateral
     */
    function _getConfigurationData(
        DataTypes.ReserveData storage collateralReserve,
        DataTypes.ExecuteLiquidationCallParams memory params
    )
        internal
        view
        returns (
            address,
            address,
            address,
            uint256
        )
    {
        address collateralXToken = collateralReserve.xTokenAddress;
        uint256 liquidationBonus = collateralReserve
            .configuration
            .getLiquidationBonus();

        address collateralPriceSource = params.collateralAsset;
        address debtPriceSource = params.liquidationAsset;

        return (
            collateralXToken,
            collateralPriceSource,
            debtPriceSource,
            liquidationBonus
        );
    }

    struct AvailableCollateralToLiquidateLocalVars {
        uint256 collateralPrice;
        uint256 liquidationAssetPrice;
        uint256 debtToCoverInBaseCurrency;
        uint256 liquidationAssetDecimals;
        uint256 collateralDecimals;
        uint256 collateralAssetUnit;
        uint256 liquidationAssetUnit;
        uint256 actualCollateralToLiquidate;
        uint256 actualLiquidationAmount;
        uint256 actualLiquidationBonus;
        uint256 liquidationProtocolFeePercentage;
        uint256 liquidationProtocolFee;
        address collateralAsset;
        uint256 multiplier;
        uint256 startTime;
    }

    /**
     * @notice Calculates how much of a specific collateral can be liquidated, given
     * a certain amount of debt asset.
     * @dev This function needs to be called after all the checks to validate the liquidation have been performed,
     *   otherwise it might fail.
     * @param collateralReserve The data of the collateral reserve
     * @param liquidationAssetReserveCache The cached data of the debt reserve
     * @param collateralAsset The address of the underlying asset used as collateral, to receive as result of the liquidation
     * @param liquidationAsset The address of the underlying borrowed asset to be repaid with the liquidation
     * @param liquidationAmount The debt amount of borrowed `asset` the liquidator wants to cover
     * @param userCollateralBalance The collateral balance for the specific `collateralAsset` of the user being liquidated
     * @param liquidationBonus The collateral bonus percentage to receive as result of the liquidation
     * @return The maximum amount that is possible to liquidate given all the liquidation constraints (user balance, close factor)
     * @return The amount to repay with the liquidation
     * @return The fee taken from the liquidation bonus amount to be paid to the protocol
     **/
    function _calculateERC20LiquidationParameters(
        DataTypes.ReserveData storage collateralReserve,
        DataTypes.ReserveCache memory liquidationAssetReserveCache,
        address collateralAsset,
        address liquidationAsset,
        uint256 liquidationAmount,
        uint256 userCollateralBalance,
        uint256 liquidationBonus,
        IPriceOracleGetter oracle
    )
        internal
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        AvailableCollateralToLiquidateLocalVars memory vars;

        vars.collateralPrice = oracle.getAssetPrice(collateralAsset);
        vars.liquidationAssetPrice = oracle.getAssetPrice(liquidationAsset);

        vars.collateralDecimals = collateralReserve.configuration.getDecimals();
        vars.liquidationAssetDecimals = liquidationAssetReserveCache
            .reserveConfiguration
            .getDecimals();

        unchecked {
            vars.collateralAssetUnit = 10**vars.collateralDecimals;
            vars.liquidationAssetUnit = 10**vars.liquidationAssetDecimals;
        }

        vars.liquidationProtocolFeePercentage = collateralReserve
            .configuration
            .getLiquidationProtocolFee();

        uint256 maxCollateralToLiquidate = ((vars.liquidationAssetPrice *
            liquidationAmount *
            vars.collateralAssetUnit) /
            (vars.collateralPrice * vars.liquidationAssetUnit)).percentMul(
                liquidationBonus
            );

        if (maxCollateralToLiquidate > userCollateralBalance) {
            vars.actualCollateralToLiquidate = userCollateralBalance;
            vars.actualLiquidationAmount = (
                ((vars.collateralPrice *
                    vars.actualCollateralToLiquidate *
                    vars.liquidationAssetUnit) /
                    (vars.liquidationAssetPrice * vars.collateralAssetUnit))
            ).percentDiv(liquidationBonus);
        } else {
            vars.actualCollateralToLiquidate = maxCollateralToLiquidate;
            vars.actualLiquidationAmount = liquidationAmount;
        }

        if (vars.liquidationProtocolFeePercentage != 0) {
            uint256 bonusCollateral = vars.actualCollateralToLiquidate -
                vars.actualCollateralToLiquidate.percentDiv(liquidationBonus);

            vars.liquidationProtocolFee = bonusCollateral.percentMul(
                vars.liquidationProtocolFeePercentage
            );

            return (
                vars.actualCollateralToLiquidate - vars.liquidationProtocolFee,
                vars.actualLiquidationAmount,
                vars.liquidationProtocolFee
            );
        } else {
            return (
                vars.actualCollateralToLiquidate,
                vars.actualLiquidationAmount,
                0
            );
        }
    }

    /**
     * @notice Calculates how much of a specific collateral can be liquidated, given
     * a certain amount of debt asset.
     * @dev This function needs to be called after all the checks to validate the liquidation have been performed,
     *   otherwise it might fail.
     * @param collateralReserve The data of the collateral reserve
     * @param liquidationAssetReserveCache The cached data of the debt reserve
     * @param collateralAsset The address of the underlying asset used as collateral, to receive as result of the liquidation
     * @param liquidationAsset The address of the underlying borrowed asset to be repaid with the liquidation
     * @param userGlobalDebt The total debt the user has
     * @param liquidationAmount The debt amount of borrowed `asset` the liquidator wants to cover
     * @param liquidationBonus The collateral bonus percentage to receive as result of the liquidation
     * @param auctionEnabled If the auction is enabled or not on the collateral asset
     * @param collateralTokenId The collateral token id
     * @return The discounted nft price + the liquidationProtocolFee
     * @return The liquidationProtocolFee
     * @return The debt price you are paying in (for example, USD or ETH)
     * @return The amount of debt the liquidator can cover using the base currency they are using for liquidation
     **/
    function _calculateERC721LiquidationParameters(
        DataTypes.ReserveData storage collateralReserve,
        DataTypes.ReserveCache memory liquidationAssetReserveCache,
        address collateralAsset,
        address liquidationAsset,
        uint256 userGlobalDebt,
        uint256 liquidationAmount,
        uint256 liquidationBonus,
        uint256 collateralTokenId,
        bool auctionEnabled,
        IPriceOracleGetter oracle
    )
        internal
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        AvailableCollateralToLiquidateLocalVars memory vars;
        vars.collateralAsset = collateralAsset;

        // price of the asset that is used as collateral
        if (INToken(collateralReserve.xTokenAddress).getAtomicPricingConfig()) {
            vars.collateralPrice = oracle.getTokenPrice(
                collateralAsset,
                collateralTokenId
            );
        } else {
            vars.collateralPrice = oracle.getAssetPrice(collateralAsset);
        }

        if (
            auctionEnabled &&
            IAuctionableERC721(collateralReserve.xTokenAddress).isAuctioned(
                collateralTokenId
            )
        ) {
            vars.startTime = IAuctionableERC721(collateralReserve.xTokenAddress)
                .getAuctionData(collateralTokenId)
                .startTime;
            vars.multiplier = IReserveAuctionStrategy(
                collateralReserve.auctionStrategyAddress
            ).calculateAuctionPriceMultiplier(vars.startTime, block.timestamp);
            vars.collateralPrice = vars.collateralPrice.mul(vars.multiplier);
        }

        // price of the asset the liquidator is liquidating with
        vars.liquidationAssetPrice = oracle.getAssetPrice(liquidationAsset);
        vars.liquidationAssetDecimals = liquidationAssetReserveCache
            .reserveConfiguration
            .getDecimals();

        unchecked {
            vars.liquidationAssetUnit = 10**vars.liquidationAssetDecimals;
        }

        vars.liquidationProtocolFeePercentage = collateralReserve
            .configuration
            .getLiquidationProtocolFee();

        uint256 collateralToLiquate = (vars.collateralPrice *
            vars.liquidationAssetUnit) / vars.liquidationAssetPrice;

        // base currency to convert to liquidation asset unit.
        uint256 globalDebtAmount = (userGlobalDebt *
            vars.liquidationAssetUnit) / vars.liquidationAssetPrice;

        // (liquidation amount (passed in by liquidator, this has decimals) * liquidationAssetPrice) / number of decimals
        // ie. liquidation amount (10k DAI * 10^18) * price of DAI ($1) / 10^18 = 10k
        // vars.debtToCoverInBaseCurrency needs to be >= vars.actualLiquidationAmount otherwise the liquidator cannot buy the NFT
        // in a scenario where there are multiple people trying to liquidate and the highest amount would pay back the more of the total global debt that user has to protocol
        vars.debtToCoverInBaseCurrency =
            (liquidationAmount * vars.liquidationAssetPrice) /
            vars.liquidationAssetUnit;

        vars.actualLiquidationAmount = collateralToLiquate.percentDiv(
            liquidationBonus
        );

        if (vars.liquidationProtocolFeePercentage != 0) {
            uint256 bonusCollateral = collateralToLiquate -
                vars.actualLiquidationAmount;

            vars.liquidationProtocolFee = bonusCollateral.percentMul(
                vars.liquidationProtocolFeePercentage
            );

            return (
                vars.actualLiquidationAmount + vars.liquidationProtocolFee,
                vars.liquidationProtocolFee,
                globalDebtAmount,
                vars.debtToCoverInBaseCurrency
            );
        } else {
            return (
                vars.actualLiquidationAmount,
                0,
                globalDebtAmount,
                vars.debtToCoverInBaseCurrency
            );
        }
    }
}
