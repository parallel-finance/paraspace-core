// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721Enumerable} from "../../../dependencies/openzeppelin/contracts/IERC721Enumerable.sol";
import {IScaledBalanceToken} from "../../../interfaces/IScaledBalanceToken.sol";
import {INToken} from "../../../interfaces/INToken.sol";
import {ICollaterizableERC721} from "../../../interfaces/ICollaterizableERC721.sol";
import {IPriceOracleGetter} from "../../../interfaces/IPriceOracleGetter.sol";
import {ReserveConfiguration} from "../configuration/ReserveConfiguration.sol";
import {UserConfiguration} from "../configuration/UserConfiguration.sol";
import {PercentageMath} from "../math/PercentageMath.sol";
import {WadRayMath} from "../math/WadRayMath.sol";
import {DataTypes} from "../types/DataTypes.sol";
import {ReserveLogic} from "./ReserveLogic.sol";

/**
 * @title GenericLogic library
 *
 * @notice Implements protocol-level logic to calculate and validate the state of a user
 */
library GenericLogic {
    using ReserveLogic for DataTypes.ReserveData;
    using WadRayMath for uint256;
    using PercentageMath for uint256;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using UserConfiguration for DataTypes.UserConfigurationMap;

    struct CalculateUserAccountDataVars {
        uint256 assetPrice;
        uint256 assetUnit;
        DataTypes.AssetType assetType;
        uint256 userBalanceInBaseCurrency;
        uint256 decimals;
        uint256 ltv;
        uint256 liquidationThreshold;
        uint256 liquidationBonus;
        uint256 i;
        uint256 healthFactor;
        uint256 erc721HealthFactor;
        uint256 totalERC721CollateralInBaseCurrency;
        uint256 payableDebtByERC20Assets;
        uint256 totalCollateralInBaseCurrency;
        uint256 totalDebtInBaseCurrency;
        uint256 avgLtv;
        uint256 avgLiquidationThreshold;
        uint256 avgERC721LiquidationThreshold;
        address currentReserveAddress;
        bool hasZeroLtvCollateral;
    }

    /**
     * @notice Calculates the user data across the reserves.
     * @dev It includes the total liquidity/collateral/borrow balances in the base currency used by the price feed,
     * the average Loan To Value, the average Liquidation Ratio, and the Health factor.
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param params Additional parameters needed for the calculation
     * @return The total collateral of the user in the base currency used by the price feed
     * @return The total ERC721 collateral of the user in the base currency used by the price feed
     * @return The total debt of the user in the base currency used by the price feed
     * @return The average ltv of the user
     * @return The average liquidation threshold of the user
     * @return The health factor of the user
     * @return True if the ltv is zero, false otherwise
     **/
    function calculateUserAccountData(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.CalculateUserAccountDataParams memory params
    )
        internal
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            bool
        )
    {
        if (params.userConfig.isEmpty()) {
            return (
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                type(uint256).max,
                type(uint256).max,
                false
            );
        }

        CalculateUserAccountDataVars memory vars;

        while (vars.i < params.reservesCount) {
            if (!params.userConfig.isUsingAsCollateralOrBorrowing(vars.i)) {
                unchecked {
                    ++vars.i;
                }
                continue;
            }

            vars.currentReserveAddress = reservesList[vars.i];

            if (vars.currentReserveAddress == address(0)) {
                unchecked {
                    ++vars.i;
                }
                continue;
            }

            DataTypes.ReserveData storage currentReserve = reservesData[
                vars.currentReserveAddress
            ];

            vars.assetType = currentReserve.assetType;

            (
                vars.ltv,
                vars.liquidationThreshold,
                vars.liquidationBonus,
                vars.decimals,

            ) = currentReserve.configuration.getParams();

            unchecked {
                vars.assetUnit = 10**vars.decimals;
            }

            if (
                vars.liquidationThreshold != 0 &&
                params.userConfig.isUsingAsCollateral(vars.i)
            ) {
                (
                    vars.userBalanceInBaseCurrency,
                    vars.assetPrice
                ) = _getUserBalanceInBaseCurrency(
                    params.user,
                    currentReserve,
                    params.oracle,
                    vars.assetUnit,
                    vars.currentReserveAddress
                );

                vars.totalCollateralInBaseCurrency += vars
                    .userBalanceInBaseCurrency;

                if (vars.ltv != 0) {
                    vars.avgLtv += vars.userBalanceInBaseCurrency * vars.ltv;
                } else {
                    vars.hasZeroLtvCollateral = true;
                }

                vars.liquidationThreshold =
                    vars.userBalanceInBaseCurrency *
                    (vars.liquidationThreshold);

                vars.avgLiquidationThreshold += vars.liquidationThreshold;

                if (vars.assetType == DataTypes.AssetType.ERC721) {
                    vars.totalERC721CollateralInBaseCurrency += vars
                        .userBalanceInBaseCurrency;
                    vars.avgERC721LiquidationThreshold += vars
                        .liquidationThreshold;
                } else {
                    vars.payableDebtByERC20Assets += vars
                        .userBalanceInBaseCurrency
                        .percentDiv(vars.liquidationBonus);
                }
            } else {
                vars.assetPrice = IPriceOracleGetter(params.oracle)
                    .getAssetPrice(vars.currentReserveAddress);
            }

            if (params.userConfig.isBorrowing(vars.i)) {
                vars.totalDebtInBaseCurrency += _getUserDebtInBaseCurrency(
                    params.user,
                    currentReserve,
                    vars.assetPrice,
                    vars.assetUnit
                );
            }

            unchecked {
                ++vars.i;
            }
        }

        unchecked {
            vars.avgLtv = vars.totalCollateralInBaseCurrency != 0
                ? vars.avgLtv / vars.totalCollateralInBaseCurrency
                : 0;
            vars.avgLiquidationThreshold = vars.totalCollateralInBaseCurrency !=
                0
                ? vars.avgLiquidationThreshold /
                    vars.totalCollateralInBaseCurrency
                : 0;

            vars.avgERC721LiquidationThreshold = vars
                .totalERC721CollateralInBaseCurrency != 0
                ? vars.avgERC721LiquidationThreshold /
                    vars.totalERC721CollateralInBaseCurrency
                : 0;
        }

        vars.healthFactor = (vars.totalDebtInBaseCurrency == 0)
            ? type(uint256).max
            : (
                vars.totalCollateralInBaseCurrency.percentMul(
                    vars.avgLiquidationThreshold
                )
            ).wadDiv(vars.totalDebtInBaseCurrency);

        vars.erc721HealthFactor = (vars.totalDebtInBaseCurrency == 0 ||
            vars.payableDebtByERC20Assets >= vars.totalDebtInBaseCurrency)
            ? type(uint256).max
            : (
                vars.totalERC721CollateralInBaseCurrency.percentMul(
                    vars.avgERC721LiquidationThreshold
                )
            ).wadDiv(
                    vars.totalDebtInBaseCurrency - vars.payableDebtByERC20Assets
                );

        return (
            vars.totalCollateralInBaseCurrency,
            vars.totalERC721CollateralInBaseCurrency,
            vars.totalDebtInBaseCurrency,
            vars.avgLtv,
            vars.avgLiquidationThreshold,
            vars.avgERC721LiquidationThreshold,
            vars.payableDebtByERC20Assets,
            vars.healthFactor,
            vars.erc721HealthFactor,
            vars.hasZeroLtvCollateral
        );
    }

    /**
     * @notice Calculates the maximum amount that can be borrowed depending on the available collateral, the total debt
     * and the average Loan To Value
     * @param totalCollateralInBaseCurrency The total collateral in the base currency used by the price feed
     * @param totalDebtInBaseCurrency The total borrow balance in the base currency used by the price feed
     * @param ltv The average loan to value
     * @return The amount available to borrow in the base currency of the used by the price feed
     **/
    function calculateAvailableBorrows(
        uint256 totalCollateralInBaseCurrency,
        uint256 totalDebtInBaseCurrency,
        uint256 ltv
    ) internal pure returns (uint256) {
        uint256 availableBorrowsInBaseCurrency = totalCollateralInBaseCurrency
            .percentMul(ltv);

        if (availableBorrowsInBaseCurrency < totalDebtInBaseCurrency) {
            return 0;
        }

        availableBorrowsInBaseCurrency =
            availableBorrowsInBaseCurrency -
            totalDebtInBaseCurrency;
        return availableBorrowsInBaseCurrency;
    }

    /**
     * @notice Calculates total debt of the user in the based currency used to normalize the values of the assets
     * @dev This fetches the `balanceOf` of the stable and variable debt tokens for the user. For gas reasons, the
     * variable debt balance is calculated by fetching `scaledBalancesOf` normalized debt, which is cheaper than
     * fetching `balanceOf`
     * @param user The address of the user
     * @param reserve The data of the reserve for which the total debt of the user is being calculated
     * @param assetPrice The price of the asset for which the total debt of the user is being calculated
     * @param assetUnit The value representing one full unit of the asset (10^decimals)
     * @return The total debt of the user normalized to the base currency
     **/
    function _getUserDebtInBaseCurrency(
        address user,
        DataTypes.ReserveData storage reserve,
        uint256 assetPrice,
        uint256 assetUnit
    ) private view returns (uint256) {
        // fetching variable debt
        uint256 userTotalDebt = IScaledBalanceToken(
            reserve.variableDebtTokenAddress
        ).scaledBalanceOf(user);
        if (userTotalDebt != 0) {
            userTotalDebt = userTotalDebt.rayMul(reserve.getNormalizedDebt());
        }

        userTotalDebt =
            userTotalDebt +
            IERC20(reserve.stableDebtTokenAddress).balanceOf(user);

        userTotalDebt = assetPrice * userTotalDebt;

        unchecked {
            return userTotalDebt / assetUnit;
        }
    }

    /**
     * @notice Calculates total xToken balance of the user in the based currency used by the price oracle
     * @dev For gas reasons, the xToken balance is calculated by fetching `scaledBalancesOf` normalized debt, which
     * is cheaper than fetching `balanceOf`
     * @param user The address of the user
     * @param reserve The data of the reserve for which the total xToken balance of the user is being calculated
     * @param assetUnit The value representing one full unit of the asset (10^decimals)
     * @return The total xToken balance of the user normalized to the base currency of the price oracle
     **/
    function _getUserBalanceInBaseCurrency(
        address user,
        DataTypes.ReserveData storage reserve,
        address oracle,
        uint256 assetUnit,
        address currentReserveAddress
    ) private view returns (uint256, uint256) {
        uint256 balance;
        uint256 assetPrice;
        address xTokenAddress = reserve.xTokenAddress;

        if (reserve.assetType == DataTypes.AssetType.ERC20) {
            assetPrice = IPriceOracleGetter(oracle).getAssetPrice(
                currentReserveAddress
            );

            uint256 normalizedIncome = reserve.getNormalizedIncome();
            balance =
                (
                    IScaledBalanceToken(xTokenAddress)
                        .scaledBalanceOf(user)
                        .rayMul(normalizedIncome)
                ) *
                assetPrice;
        } else if (reserve.assetType == DataTypes.AssetType.ERC721) {
            if (INToken(xTokenAddress).getAtomicPricingConfig()) {
                uint256 totalBalance = INToken(xTokenAddress).balanceOf(user);

                for (uint256 index = 0; index < totalBalance; index++) {
                    uint256 tokenId = IERC721Enumerable(xTokenAddress)
                        .tokenOfOwnerByIndex(user, index);
                    if (
                        ICollaterizableERC721(xTokenAddress).isUsedAsCollateral(
                            tokenId
                        )
                    ) {
                        // TODO use getTokensPrices instead if it saves gas
                        assetPrice = IPriceOracleGetter(oracle).getTokenPrice(
                            currentReserveAddress,
                            tokenId
                        );
                        balance += assetPrice;
                    }
                }
            } else {
                assetPrice = IPriceOracleGetter(oracle).getAssetPrice(
                    currentReserveAddress
                );
                balance =
                    ICollaterizableERC721(xTokenAddress).collaterizedBalanceOf(
                        user
                    ) *
                    assetPrice;
            }
        }

        unchecked {
            return (balance / assetUnit, assetPrice);
        }
    }
}
