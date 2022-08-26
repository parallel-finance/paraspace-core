// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

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
import {AuctionLiquidationConfiguration} from "../../libraries/configuration/AuctionLiquidationConfiguration.sol";
import {IPToken} from "../../../interfaces/IPToken.sol";
import {ICollaterizableERC721} from "../../../interfaces/ICollaterizableERC721.sol";
import {INToken} from "../../../interfaces/INToken.sol";

import {IStableDebtToken} from "../../../interfaces/IStableDebtToken.sol";
import {IVariableDebtToken} from "../../../interfaces/IVariableDebtToken.sol";
import {IPriceOracleGetter} from "../../../interfaces/IPriceOracleGetter.sol";

/**
 * @title AuctionLiquidationLogic library
 *
 **/
library AuctionLiquidationLogic {
    using PercentageMath for uint256;
    using ReserveLogic for DataTypes.ReserveCache;
    using ReserveLogic for DataTypes.ReserveData;
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using AuctionLiquidationConfiguration for DataTypes.AuctionLiquidationConfigurationMap;
    using GPv2SafeERC20 for IERC20;

    /// @notice when a new action is started
    event AuctionStarted(address who, uint256 startTime, uint256 endTime);

    /// @notice emit a message when we have a new highest bidder
    event HighestBid(
        address who,
        uint256 amount,
        address collateralAsset,
        uint256 collateralTokenId
    );

    struct AuctionLiquidationStartLocalVars {
        uint256 healthFactor;
    }

    struct AuctionLiquidationEndLocalVars {
        uint256 userCollateralBalance;
        uint256 userGlobalCollateralBalance;
        uint256 userVariableDebt;
        uint256 userGlobalTotalDebt;
        uint256 userTotalDebt;
        uint256 actualDebtToLiquidate;
        uint256 collateralDiscountedPrice;
        uint256 actualCollateralToLiquidate;
        uint256 liquidationBonus;
        uint256 healthFactor;
        uint256 liquidationProtocolFeeAmount;
        address collateralPriceSource;
        address debtPriceSource;
        address collateralXToken;
        // uint256 healthFactor;
        uint256 collateralPrice;
        bool isLiquidationAssetBorrowed;
        DataTypes.ReserveCache debtReserveCache;
        DataTypes.AssetType assetType;
    }

    struct AuctionLiquidationBidLocalVars {
        uint256 userCollateralBalance;
        uint256 userGlobalCollateralBalance;
        uint256 userVariableDebt;
        uint256 userGlobalTotalDebt;
        uint256 userTotalDebt;
        uint256 actualDebtToLiquidate;
        uint256 collateralDiscountedPrice;
        uint256 actualCollateralToLiquidate;
        uint256 liquidationBonus;
        uint256 healthFactor;
        uint256 liquidationProtocolFeeAmount;
        address collateralPriceSource;
        address debtPriceSource;
        address collateralXToken;
        // uint256 healthFactor;
        uint256 collateralPrice;
        bool isLiquidationAssetBorrowed;
        DataTypes.ReserveCache debtReserveCache;
        DataTypes.AssetType assetType;
    }

    /// @notice let anyone start an auction if the health factory of an
    /// nft is below the target.
    function executeAuctionLiquidationStart(
        mapping(address => mapping(uint256 => DataTypes.Auction))
            storage auctionData,
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        mapping(address => DataTypes.UserConfigurationMap) storage usersConfig,
        DataTypes.ExecuteAuctionLiquidationStartParams memory params
    ) external {
        AuctionLiquidationEndLocalVars memory vars;

        DataTypes.UserConfigurationMap storage userConfig = usersConfig[
            params.user
        ];

        DataTypes.ReserveData storage collateralReserve = reservesData[
            params.collateralAsset
        ];

        // TODO: be more specific about which ERC721 to allow
        require(
            collateralReserve.assetType == DataTypes.AssetType.ERC721,
            "This asset cannot be auctioned"
        );

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

        // a threshold slightly above 100
        uint8 auctionStartThreshold = collateralReserve
            .auctionConfiguration
            .getAuctionStartThreshold();

        // check that users health is below threshold
        require(
            vars.healthFactor < auctionStartThreshold,
            "Users health factor must be below the threshold"
        );

        DataTypes.Auction storage _auction = auctionData[
            params.collateralAsset
        ][params.collateralTokenId];

        // value in time
        uint8 auctionHourDuration = collateralReserve
            .auctionConfiguration
            .getAuctionHourDuration();

        // set values by converting hours to seconds
        _auction.endTime = block.timestamp + auctionHourDuration * 60 * 60;
    }

    /// @notice let anyone end an auction if the time is up
    function executeAuctionLiquidationEnd(
        mapping(address => mapping(uint256 => DataTypes.Auction))
            storage auctionData,
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        mapping(address => DataTypes.UserConfigurationMap) storage usersConfig,
        DataTypes.ExecuteAuctionLiquidationEndParams memory params
    ) external {
        AuctionLiquidationEndLocalVars memory vars;

        DataTypes.Auction storage _auction = auctionData[
            params.collateralAsset
        ][params.collateralTokenId];

        DataTypes.ReserveData storage collateralReserve = reservesData[
            params.collateralAsset
        ];

        // check the type
        vars.assetType = collateralReserve.assetType;
        DataTypes.ReserveData storage liquidationAssetReserve = reservesData[
            params.liquidationAsset
        ];

        // check that collateral owner is still underwater
        DataTypes.UserConfigurationMap storage userConfig = usersConfig[
            params.user
        ];

        uint16 liquidationAssetReserveId = liquidationAssetReserve.id;

        {
            // scope calls to stack doesnt get too deep

            vars.debtReserveCache = liquidationAssetReserve.cache();
            liquidationAssetReserve.updateState(vars.debtReserveCache);

            // check if the auction is still going - check if time is up
            require(
                block.timestamp > _auction.endTime,
                "Auction end time not reached"
            );

            // check if is still pending
            require(!_auction.isResolved, "Auction is already resolved");

            // set resolved
            _auction.isResolved = true;

            // check caller is highest bid
            require(
                params.bidder == _auction.highestBidder,
                "Caller is not the highest bidder"
            );

            // check highest bid is above 95% of floor
            vars.collateralPrice = IPriceOracleGetter(params.priceOracle)
                .getAssetPrice(params.collateralAsset);

            // a value between 0 and 100
            uint8 floorThresholdPercentage = collateralReserve
                .auctionConfiguration
                .getFloorThresholdPercentage();

            require(
                // _auction.highestBid > (95 * vars.collateralPrice) / 100,
                _auction.highestBid >
                    (floorThresholdPercentage * vars.collateralPrice) / 100,
                "Highest bid is not above 95% of floor"
            );

            (
                vars.userGlobalCollateralBalance,
                ,
                ,
                ,
                ,
                ,
                ,
                vars.healthFactor,
                ,

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

            require(
                vars.healthFactor < 100,
                "Users health factor must be below the threshold"
            );
        }

        /// TODO: test and validate
        /// @dev: below is modified liqidation logic

        // check if asset is borrowed
        vars.isLiquidationAssetBorrowed = userConfig.isBorrowing(
            liquidationAssetReserveId
        );

        // if its borrowed
        if (vars.isLiquidationAssetBorrowed) {
            // calc the debt it owes
            (
                vars.userVariableDebt,
                vars.userTotalDebt,
                vars.actualDebtToLiquidate
            ) = _calculateDebt(
                vars.debtReserveCache,
                params.user,
                params.liquidationAmount
            );
        }

        // get reserve config details
        (
            vars.collateralXToken,
            vars.collateralPriceSource,
            vars.debtPriceSource,
            vars.liquidationBonus
        ) = _getConfigurationData(collateralReserve, params);

        // if we should apply bonus
        if (!vars.isLiquidationAssetBorrowed) {
            vars.liquidationBonus = PercentageMath.PERCENTAGE_FACTOR;
        }

        // get current balance
        vars.userCollateralBalance = ICollaterizableERC721(
            vars.collateralXToken
        ).collaterizedBalanceOf(params.user);

        // vars.userGlobalTotalDebt is set twice to get updated in base currency if it is not already
        (
            vars.collateralDiscountedPrice,
            vars.liquidationProtocolFeeAmount,
            vars.userGlobalTotalDebt,

        ) = _calculateERC721LiquidationParameters(
            collateralReserve,
            vars.debtReserveCache,
            vars.collateralPriceSource,
            vars.debtPriceSource,
            vars.userGlobalTotalDebt,
            vars.actualDebtToLiquidate,
            vars.userCollateralBalance,
            vars.liquidationBonus,
            IPriceOracleGetter(params.priceOracle)
        );

        // make sure we meet all our checks to liquidate
        ValidationLogic.validateERC721LiquidationCall(
            userConfig,
            collateralReserve,
            DataTypes.ValidateERC721LiquidationCallParams({
                debtReserveCache: vars.debtReserveCache,
                totalDebt: vars.userGlobalTotalDebt,
                collateralDiscountedPrice: vars.collateralDiscountedPrice,
                liquidationAmount: params.liquidationAmount,
                healthFactor: vars.healthFactor,
                priceOracleSentinel: params.priceOracleSentinel,
                tokenId: params.collateralTokenId,
                assetType: vars.assetType,
                xTokenAddress: vars.collateralXToken
            })
        );

        uint256 debtCanBeCovered = vars.collateralDiscountedPrice -
            vars.liquidationProtocolFeeAmount;
        // Debt to be covered for the nft = discounted price for NFT, not including protocol fees
        // collateralDiscountedPrice includes the fees by default so you need to subtract them

        if (debtCanBeCovered > vars.actualDebtToLiquidate) {
            // the discounted price will never be greater than the amount the liquidator is passing in
            // require(params.liquidationAmount >= params.collateralDiscountedPrice) - line 669 of ValidationLogic.sol
            // there will always be excess if the discounted price is > amount needed to liquidate
            // vars.actualDebtToLiquidate = The actual debt that is getting liquidated. If liquidation amount passed in by the liquidator is greater then the total user debt, then use the user total debt as the actual debt getting liquidated. If the user total debt is greater than the liquidation amount getting passed in by the liquidator, then use the liquidation amount the user is passing in.
            if (vars.userGlobalTotalDebt > vars.actualDebtToLiquidate) {
                // userGlobalTotalDebt = debt across all positions (ie. if there are multiple positions)
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
                }
            } else {
                // if the actual debt that is getting liquidated > user global debt then pay back excess to user
                IERC20(params.liquidationAsset).safeTransferFrom(
                    msg.sender,
                    params.user,
                    debtCanBeCovered - vars.actualDebtToLiquidate
                );
            }
        } else {
            // if the actual debt that is getting liquidated > discounted price then there is no excess amount
            // update the actual debt that is getting liquidated to the discounted price of the nft
            vars.actualDebtToLiquidate = debtCanBeCovered;
        }

        if (vars.actualDebtToLiquidate != 0) {
            _burnDebtTokens(params, vars);
            liquidationAssetReserve.updateInterestRates(
                vars.debtReserveCache,
                params.liquidationAsset,
                vars.actualDebtToLiquidate,
                0
            );

            IERC20(params.liquidationAsset).safeTransferFrom(
                msg.sender,
                vars.debtReserveCache.xTokenAddress,
                vars.actualDebtToLiquidate
            );
        }

        if (params.receiveXToken) {
            _liquidateNTokens(usersConfig, collateralReserve, params, vars);
        } else {
            _burnCollateralNTokens(params, vars);
        }

        if (vars.userTotalDebt == vars.actualDebtToLiquidate) {
            userConfig.setBorrowing(liquidationAssetReserve.id, false);
        }

        // Transfer fee to treasury if it is non-zero
        if (vars.liquidationProtocolFeeAmount != 0) {
            IERC20(params.liquidationAsset).safeTransferFrom(
                msg.sender,
                IPToken(vars.debtReserveCache.xTokenAddress)
                    .RESERVE_TREASURY_ADDRESS(),
                vars.liquidationProtocolFeeAmount
            );
        }

        // If the collateral being liquidated is equal to the user balance,
        // we set the currency as not being used as collateral anymore
        if (vars.userCollateralBalance == 1) {
            userConfig.setUsingAsCollateral(collateralReserve.id, false);
        }

        // emit
    }

    /// @notice people should be able to bid
    function executeAuctionLiquidationBid(
        mapping(address => mapping(uint256 => DataTypes.Auction))
            storage auctionData,
        mapping(address => DataTypes.ReserveData) storage reservesData,
        DataTypes.ExecuteAuctionLiquidationBidParams memory params
    ) external {
        AuctionLiquidationBidLocalVars memory vars;

        DataTypes.Auction storage _auction = auctionData[
            params.collateralAsset
        ][params.collateralTokenId];

        require(
            msg.value > _auction.highestBid,
            "Bid is not higher than existing highest bid"
        );

        DataTypes.ReserveData storage collateralReserve = reservesData[
            params.collateralAsset
        ];

        // check the type
        vars.assetType = collateralReserve.assetType;
        DataTypes.ReserveData storage liquidationAssetReserve = reservesData[
            params.liquidationAsset
        ];

        uint16 liquidationAssetReserveId = liquidationAssetReserve.id;
        vars.debtReserveCache = liquidationAssetReserve.cache();
        liquidationAssetReserve.updateState(vars.debtReserveCache);

        (
            vars.userVariableDebt,
            vars.userTotalDebt,
            vars.actualDebtToLiquidate
        ) = _calculateDebt(
            vars.debtReserveCache,
            params.user,
            params.liquidationAmount
        );

        // must cover amount of debt
        require(
            params.bidAmount > (vars.actualDebtToLiquidate * 50) / 100,
            "Bid does not cover enough debt"
        );

        // return previous amount to last highest bidder
        payable(_auction.highestBidder).transfer(_auction.highestBid);

        // set the new highest bid/bidder
        _auction.highestBid = params.bidAmount;
        _auction.highestBidder = params.bidder;
        emit HighestBid(
            params.bidder,
            params.bidAmount,
            params.collateralAsset,
            params.collateralTokenId
        );
    }

    function _calculateDebt(
        DataTypes.ReserveCache memory debtReserveCache,
        address user,
        uint256 liquidationAmount
    )
        internal
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        (uint256 userStableDebt, uint256 userVariableDebt) = Helpers
            .getUserCurrentDebt(user, debtReserveCache);

        uint256 userTotalDebt = userStableDebt + userVariableDebt;
        // userTotalDebt = debt of the borrowed position needed for liquidation

        uint256 actualDebtToLiquidate = liquidationAmount > userTotalDebt
            ? userTotalDebt
            : liquidationAmount;

        return (userVariableDebt, userTotalDebt, actualDebtToLiquidate);
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
        DataTypes.ExecuteAuctionLiquidationEndParams memory params
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

    /**
     * @notice Burns the collateral xTokens and transfers the underlying to the liquidator.
     * @dev   The function also updates the state and the interest rate of the collateral reserve.
     * @param params The additional parameters needed to execute the liquidation function
     * @param vars The executeLiquidationCall() function local vars
     */
    function _burnCollateralNTokens(
        DataTypes.ExecuteAuctionLiquidationEndParams memory params,
        AuctionLiquidationEndLocalVars memory vars
    ) internal {
        // Burn the equivalent amount of xToken, sending the underlying to the liquidator
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = params.collateralTokenId;
        INToken(vars.collateralXToken).burn(params.user, msg.sender, tokenIds);
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
    function _liquidateNTokens(
        mapping(address => DataTypes.UserConfigurationMap) storage usersConfig,
        DataTypes.ReserveData storage collateralReserve,
        DataTypes.ExecuteAuctionLiquidationEndParams memory params,
        AuctionLiquidationEndLocalVars memory vars
    ) internal {
        uint256 liquidatorPreviousNTokenBalance = ICollaterizableERC721(
            vars.collateralXToken
        ).collaterizedBalanceOf(msg.sender);

        bool isTokenUsedAsCollateral = ICollaterizableERC721(
            vars.collateralXToken
        ).isUsedAsCollateral(params.collateralTokenId);

        INToken(vars.collateralXToken).transferOnLiquidation(
            params.user,
            msg.sender,
            params.collateralTokenId
        );

        if (liquidatorPreviousNTokenBalance == 0 && isTokenUsedAsCollateral) {
            DataTypes.UserConfigurationMap
                storage liquidatorConfig = usersConfig[msg.sender];

            liquidatorConfig.setUsingAsCollateral(collateralReserve.id, true);
        }
    }

    /**
     * @notice Burns the debt tokens of the user up to the amount being repaid by the liquidator.
     * @dev The function alters the `debtReserveCache` state in `vars` to update the debt related data.
     * @param params The additional parameters needed to execute the liquidation function
     * @param vars the executeLiquidationCall() function local vars
     */
    function _burnDebtTokens(
        DataTypes.ExecuteAuctionLiquidationEndParams memory params,
        AuctionLiquidationEndLocalVars memory vars
    ) internal {
        if (vars.userVariableDebt >= vars.actualDebtToLiquidate) {
            vars.debtReserveCache.nextScaledVariableDebt = IVariableDebtToken(
                vars.debtReserveCache.variableDebtTokenAddress
            ).burn(
                    params.user,
                    vars.actualDebtToLiquidate,
                    vars.debtReserveCache.nextVariableBorrowIndex
                );
        } else {
            // If the user doesn't have variable debt, no need to try to burn variable debt tokens
            if (vars.userVariableDebt != 0) {
                vars
                    .debtReserveCache
                    .nextScaledVariableDebt = IVariableDebtToken(
                    vars.debtReserveCache.variableDebtTokenAddress
                ).burn(
                        params.user,
                        vars.userVariableDebt,
                        vars.debtReserveCache.nextVariableBorrowIndex
                    );
            }
            (
                vars.debtReserveCache.nextTotalStableDebt,
                vars.debtReserveCache.nextAvgStableBorrowRate
            ) = IStableDebtToken(vars.debtReserveCache.stableDebtTokenAddress)
                .burn(
                    params.user,
                    vars.actualDebtToLiquidate - vars.userVariableDebt
                );
        }
    }

    struct AvailableCollateralToLiquidateLocalVars {
        uint256 collateralPrice;
        uint256 debtAssetPrice;
        uint256 globalDebtPrice;
        uint256 debtToCoverInBaseCurrency;
        uint256 maxCollateralToLiquidate;
        uint256 baseCollateral;
        uint256 bonusCollateral;
        uint256 debtAssetDecimals;
        uint256 collateralDecimals;
        uint256 collateralAssetUnit;
        uint256 debtAssetUnit;
        uint256 collateralAmount;
        uint256 collateralPriceInDebtAsset;
        uint256 collateralDiscountedPrice;
        uint256 actualLiquidationBonus;
        uint256 liquidationProtocolFeePercentage;
        uint256 liquidationProtocolFee;
    }

    /**
     * @notice Calculates how much of a specific collateral can be liquidated, given
     * a certain amount of debt asset.
     * @dev This function needs to be called after all the checks to validate the liquidation have been performed,
     *   otherwise it might fail.
     * @param collateralReserve The data of the collateral reserve
     * @param debtReserveCache The cached data of the debt reserve
     * @param collateralAsset The address of the underlying asset used as collateral, to receive as result of the liquidation
     * @param liquidationAsset The address of the underlying borrowed asset to be repaid with the liquidation
     * @param userGlobalTotalDebt The total debt the user has
     * @param liquidationAmount The debt amount of borrowed `asset` the liquidator wants to cover
     * @param userCollateralBalance The collateral balance for the specific `collateralAsset` of the user being liquidated
     * @param liquidationBonus The collateral bonus percentage to receive as result of the liquidation
     * @return The discounted nft price + the liquidationProtocolFee
     * @return The liquidationProtocolFee
     * @return The debt price you are paying in (for example, USD or ETH)
     * @return The amount of debt the liquidator can cover using the base currency they are using for liquidation
     **/
    function _calculateERC721LiquidationParameters(
        DataTypes.ReserveData storage collateralReserve,
        DataTypes.ReserveCache memory debtReserveCache,
        address collateralAsset,
        address liquidationAsset,
        uint256 userGlobalTotalDebt,
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
            uint256,
            uint256
        )
    {
        AvailableCollateralToLiquidateLocalVars memory vars;

        // price of the asset that is used as collateral
        vars.collateralPrice = oracle.getAssetPrice(collateralAsset);
        // price of the asset the liquidator is liquidating with
        vars.debtAssetPrice = oracle.getAssetPrice(liquidationAsset);

        vars.collateralDecimals = collateralReserve.configuration.getDecimals();
        vars.debtAssetDecimals = debtReserveCache
            .reserveConfiguration
            .getDecimals();

        unchecked {
            vars.collateralAssetUnit = 10**vars.collateralDecimals;
            vars.debtAssetUnit = 10**vars.debtAssetDecimals;
        }

        vars.liquidationProtocolFeePercentage = collateralReserve
            .configuration
            .getLiquidationProtocolFee();

        vars.collateralPriceInDebtAsset = ((vars.collateralPrice *
            vars.debtAssetUnit) /
            (vars.debtAssetPrice * vars.collateralAssetUnit));

        // base currency to convert to liquidation asset unit.
        vars.globalDebtPrice =
            (userGlobalTotalDebt * vars.debtAssetUnit) /
            vars.debtAssetPrice;

        // (liquidation amount (passed in by liquidator, this has decimals) * debtAssetPrice) / number of decimals
        // ie. liquidation amount (10k DAI * 10^18) * price of DAI ($1) / 10^18 = 10k
        // vars.debtToCoverInBaseCurrency needs to be >= vars.collateralDiscountedPrice otherwise the liquidator cannot buy the NFT
        // in a scenario where there are multiple people trying to liquidate and the highest amount would pay back the more of the total global debt that user has to protocol
        vars.debtToCoverInBaseCurrency =
            (liquidationAmount * vars.debtAssetPrice) /
            vars.debtAssetUnit;

        vars.collateralDiscountedPrice = vars
            .collateralPriceInDebtAsset
            .percentDiv(liquidationBonus);

        if (vars.liquidationProtocolFeePercentage != 0) {
            vars.bonusCollateral =
                vars.collateralPriceInDebtAsset -
                vars.collateralDiscountedPrice;

            vars.liquidationProtocolFee = vars.bonusCollateral.percentMul(
                vars.liquidationProtocolFeePercentage
            );

            return (
                vars.collateralDiscountedPrice + vars.liquidationProtocolFee,
                vars.liquidationProtocolFee,
                vars.globalDebtPrice,
                vars.debtToCoverInBaseCurrency
            );
        } else {
            return (
                vars.collateralDiscountedPrice,
                0,
                vars.globalDebtPrice,
                vars.debtToCoverInBaseCurrency
            );
        }
    }
}
