// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../../dependencies/openzeppelin/contracts/IERC721.sol";

import {GPv2SafeERC20} from "../../../dependencies/gnosis/contracts/GPv2SafeERC20.sol";
import {IPToken} from "../../../interfaces/IPToken.sol";
import {INToken} from "../../../interfaces/INToken.sol";
import {ICollaterizableERC721} from "../../../interfaces/ICollaterizableERC721.sol";
import {IAuctionableERC721} from "../../../interfaces/IAuctionableERC721.sol";
import {Errors} from "../helpers/Errors.sol";
import {UserConfiguration} from "../configuration/UserConfiguration.sol";
import {DataTypes} from "../types/DataTypes.sol";
import {WadRayMath} from "../math/WadRayMath.sol";
import {PercentageMath} from "../math/PercentageMath.sol";
import {ValidationLogic} from "./ValidationLogic.sol";
import {ReserveLogic} from "./ReserveLogic.sol";
import {AuctionConfiguration} from "../configuration/AuctionConfiguration.sol";

/**
 * @title SupplyLogic library
 *
 * @notice Implements the base logic for supply/withdraw
 */
library SupplyLogic {
    using ReserveLogic for DataTypes.ReserveData;
    using AuctionConfiguration for DataTypes.ReserveAuctionConfigurationMap;
    using GPv2SafeERC20 for IERC20;
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using WadRayMath for uint256;

    // See `IPool` for descriptions
    event ReserveUsedAsCollateralEnabled(
        address indexed reserve,
        address indexed user
    );
    event ReserveUsedAsCollateralDisabled(
        address indexed reserve,
        address indexed user
    );
    event Supply(
        address indexed reserve,
        address user,
        address indexed onBehalfOf,
        uint256 amount,
        uint16 indexed referralCode
    );
    event Withdraw(
        address indexed reserve,
        address indexed user,
        address indexed to,
        uint256 amount
    );
    event SupplyERC721(
        address indexed reserve,
        address user,
        address indexed onBehalfOf,
        DataTypes.ERC721SupplyParams[] tokenData,
        uint16 indexed referralCode
    );

    event WithdrawERC721(
        address indexed reserve,
        address indexed user,
        address indexed to,
        uint256[] tokenIds
    );

    /**
     * @notice Implements the supply feature. Through `supply()`, users supply assets to the ParaSpace protocol.
     * @dev Emits the `Supply()` event.
     * @dev In the first supply action, `ReserveUsedAsCollateralEnabled()` is emitted, if the asset can be enabled as
     * collateral.
     * @param reservesData The state of all the reserves
     * @param userConfig The user configuration mapping that tracks the supplied/borrowed assets
     * @param params The additional parameters needed to execute the supply function
     */
    function executeSupply(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteSupplyParams memory params
    ) external {
        DataTypes.ReserveData storage reserve = reservesData[params.asset];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        reserve.updateState(reserveCache);

        ValidationLogic.validateSupplyERC20(
            reserveCache,
            params.amount,
            DataTypes.AssetType.ERC20
        );

        reserve.updateInterestRates(
            reserveCache,
            params.asset,
            params.amount,
            0
        );

        IERC20(params.asset).safeTransferFrom(
            msg.sender,
            reserveCache.xTokenAddress,
            params.amount
        );

        bool isFirstSupply = IPToken(reserveCache.xTokenAddress).mint(
            msg.sender,
            params.onBehalfOf,
            params.amount,
            reserveCache.nextLiquidityIndex
        );

        if (isFirstSupply) {
            userConfig.setUsingAsCollateral(reserve.id, true);
            emit ReserveUsedAsCollateralEnabled(
                params.asset,
                params.onBehalfOf
            );
        }

        emit Supply(
            params.asset,
            msg.sender,
            params.onBehalfOf,
            params.amount,
            params.referralCode
        );
    }

    function executeSupplyERC721(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteSupplyERC721Params memory params
    ) external {
        DataTypes.ReserveData storage reserve = reservesData[params.asset];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        reserve.updateState(reserveCache);

        uint256 amount = params.tokenData.length;

        ValidationLogic.validateSupplyERC721(
            reserveCache,
            amount,
            DataTypes.AssetType.ERC721
        );

        if (params.actualSpender == address(0)) {
            params.actualSpender = msg.sender;
        }

        // uint256 usedAsCollateral;

        for (uint256 index = 0; index < amount; index++) {
            // if (params.tokenData[index].useAsCollateral) {
            //     usedAsCollateral++;
            // }
            // msg.sender is wPunkGatewayProxy address who is the owner of the token = from
            // to is reserveCache.xTokenAddress
            // token id is params.tokenData[index].tokenId
            IERC721(params.asset).safeTransferFrom(
                params.actualSpender,
                reserveCache.xTokenAddress,
                params.tokenData[index].tokenId
            );
        }

        bool isFirstSupply = INToken(reserveCache.xTokenAddress).mint(
            params.onBehalfOf,
            params.tokenData
        );
        // TODO consider using (usedAsCollateral > 0) instead here to enable collateralization
        if (isFirstSupply) {
            userConfig.setUsingAsCollateral(reserve.id, true);
            emit ReserveUsedAsCollateralEnabled(
                params.asset,
                params.onBehalfOf
            );
        }

        emit SupplyERC721(
            params.asset,
            params.actualSpender,
            params.onBehalfOf,
            params.tokenData,
            params.referralCode
        );
    }

    function executeSupplyERC721FromNToken(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteSupplyERC721Params memory params
    ) external {
        DataTypes.ReserveData storage reserve = reservesData[params.asset];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        reserve.updateState(reserveCache);

        ValidationLogic.validateSupplyFromNToken(
            reserveCache,
            params,
            DataTypes.AssetType.ERC721
        );

        bool isFirstSupply = INToken(reserveCache.xTokenAddress).mint(
            params.onBehalfOf,
            params.tokenData
        );
        // TODO consider using (usedAsCollateral > 0) instead here to enable collateralization
        if (isFirstSupply) {
            userConfig.setUsingAsCollateral(reserve.id, true);
            emit ReserveUsedAsCollateralEnabled(
                params.asset,
                params.onBehalfOf
            );
        }

        emit SupplyERC721(
            params.asset,
            msg.sender,
            params.onBehalfOf,
            params.tokenData,
            params.referralCode
        );
    }

    /**
     * @notice Implements the withdraw feature. Through `withdraw()`, users redeem their xTokens for the underlying asset
     * previously supplied in the ParaSpace protocol.
     * @dev Emits the `Withdraw()` event.
     * @dev If the user withdraws everything, `ReserveUsedAsCollateralDisabled()` is emitted.
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param userConfig The user configuration mapping that tracks the supplied/borrowed assets
     * @param params The additional parameters needed to execute the withdraw function
     * @return The actual amount withdrawn
     */
    function executeWithdraw(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteWithdrawParams memory params
    ) external returns (uint256) {
        DataTypes.ReserveData storage reserve = reservesData[params.asset];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        reserve.updateState(reserveCache);

        uint256 userBalance = IPToken(reserveCache.xTokenAddress)
            .scaledBalanceOf(msg.sender)
            .rayMul(reserveCache.nextLiquidityIndex);

        uint256 amountToWithdraw = params.amount;

        if (params.amount == type(uint256).max) {
            amountToWithdraw = userBalance;
        }

        ValidationLogic.validateWithdraw(
            reserveCache,
            amountToWithdraw,
            userBalance
        );

        reserve.updateInterestRates(
            reserveCache,
            params.asset,
            0,
            amountToWithdraw
        );

        IPToken(reserveCache.xTokenAddress).burn(
            msg.sender,
            params.to,
            amountToWithdraw,
            reserveCache.nextLiquidityIndex
        );

        if (userConfig.isUsingAsCollateral(reserve.id)) {
            if (userConfig.isBorrowingAny()) {
                ValidationLogic.validateHFAndLtv(
                    reservesData,
                    reservesList,
                    userConfig,
                    params.asset,
                    msg.sender,
                    params.reservesCount,
                    params.oracle
                );
            }

            if (amountToWithdraw == userBalance) {
                userConfig.setUsingAsCollateral(reserve.id, false);
                emit ReserveUsedAsCollateralDisabled(params.asset, msg.sender);
            }
        }

        emit Withdraw(params.asset, msg.sender, params.to, amountToWithdraw);

        return amountToWithdraw;
    }

    function executeWithdrawERC721(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteWithdrawERC721Params memory params
    ) external returns (uint256) {
        DataTypes.ReserveData storage reserve = reservesData[params.asset];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        reserve.updateState(reserveCache);
        uint256 amountToWithdraw = params.tokenIds.length;

        bool withdrwingAllCollateral = INToken(reserveCache.xTokenAddress).burn(
            msg.sender,
            params.to,
            params.tokenIds
        );

        ValidationLogic.validateWithdrawERC721(reserveCache);

        bool hasAnyCollateralAsset = false;
        for (uint256 index = 0; index < params.tokenIds.length; index++) {
            if (
                ICollaterizableERC721(reserveCache.xTokenAddress)
                    .isUsedAsCollateral(params.tokenIds[index])
            ) {
                hasAnyCollateralAsset = true;
                break;
            }
        }

        if (hasAnyCollateralAsset) {
            if (userConfig.isBorrowingAny()) {
                ValidationLogic.validateHFAndLtv(
                    reservesData,
                    reservesList,
                    userConfig,
                    params.asset,
                    msg.sender,
                    params.reservesCount,
                    params.oracle
                );
            }

            if (withdrwingAllCollateral) {
                userConfig.setUsingAsCollateral(reserve.id, false);
                emit ReserveUsedAsCollateralDisabled(params.asset, msg.sender);
            }
        }

        emit WithdrawERC721(
            params.asset,
            msg.sender,
            params.to,
            params.tokenIds
        );

        return amountToWithdraw;
    }

    /**
     * @notice Validates a transfer of xTokens. The sender is subjected to health factor validation to avoid
     * collateralization constraints violation.
     * @dev Emits the `ReserveUsedAsCollateralEnabled()` event for the `to` account, if the asset is being activated as
     * collateral.
     * @dev In case the `from` user transfers everything, `ReserveUsedAsCollateralDisabled()` is emitted for `from`.
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param usersConfig The users configuration mapping that track the supplied/borrowed assets
     * @param params The additional parameters needed to execute the finalizeTransfer function
     */
    function executeFinalizeTransfer(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        mapping(address => DataTypes.UserConfigurationMap) storage usersConfig,
        DataTypes.FinalizeTransferParams memory params
    ) external {
        DataTypes.ReserveData storage reserve = reservesData[params.asset];

        ValidationLogic.validateTransfer(reserve);

        uint256 reserveId = reserve.id;

        if (params.from != params.to && params.value != 0) {
            DataTypes.UserConfigurationMap storage fromConfig = usersConfig[
                params.from
            ];

            bool usingAsCollateral;
            uint256 amount;

            if (reserve.assetType == DataTypes.AssetType.ERC721) {
                usingAsCollateral = params.usedAsCollateral;
                amount = 1;
            } else {
                usingAsCollateral = fromConfig.isUsingAsCollateral(reserveId);
                amount = params.value;
            }

            if (usingAsCollateral) {
                if (fromConfig.isBorrowingAny()) {
                    ValidationLogic.validateHFAndLtv(
                        reservesData,
                        reservesList,
                        usersConfig[params.from],
                        params.asset,
                        params.from,
                        params.reservesCount,
                        params.oracle
                    );
                }
                if (params.balanceFromBefore == amount) {
                    fromConfig.setUsingAsCollateral(reserveId, false);
                    emit ReserveUsedAsCollateralDisabled(
                        params.asset,
                        params.from
                    );
                }
            }

            if (params.balanceToBefore == 0 && params.usedAsCollateral) {
                DataTypes.UserConfigurationMap storage toConfig = usersConfig[
                    params.to
                ];

                toConfig.setUsingAsCollateral(reserveId, true);
                emit ReserveUsedAsCollateralEnabled(params.asset, params.to);
            }
        }
    }

    /**
     * @notice Executes the 'set as collateral' feature. A user can choose to activate or deactivate an asset as
     * collateral at any point in time. Deactivating an asset as collateral is subjected to the usual health factor
     * checks to ensure collateralization.
     * @dev Emits the `ReserveUsedAsCollateralEnabled()` event if the asset can be activated as collateral.
     * @dev In case the asset is being deactivated as collateral, `ReserveUsedAsCollateralDisabled()` is emitted.
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param userConfig The users configuration mapping that track the supplied/borrowed assets
     * @param asset The address of the asset being configured as collateral
     * @param useAsCollateral True if the user wants to set the asset as collateral, false otherwise
     * @param reservesCount The number of initialized reserves
     * @param priceOracle The address of the price oracle
     */
    function executeUseReserveAsCollateral(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap storage userConfig,
        address asset,
        bool useAsCollateral,
        uint256 reservesCount,
        address priceOracle
    ) external {
        DataTypes.ReserveData storage reserve = reservesData[asset];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        uint256 userBalance;
        uint256 auctionedBalance;

        if (reserveCache.assetType == DataTypes.AssetType.ERC20) {
            userBalance = IERC20(reserveCache.xTokenAddress).balanceOf(
                msg.sender
            );
            auctionedBalance = 0;
        } else {
            userBalance = ICollaterizableERC721(reserveCache.xTokenAddress)
                .collaterizedBalanceOf(msg.sender);
            auctionedBalance = IAuctionableERC721(reserveCache.xTokenAddress)
                .auctionedBalanceOf(msg.sender);
        }

        ValidationLogic.validateSetUseReserveAsCollateral(
            reserveCache,
            userBalance
        );

        if (useAsCollateral == userConfig.isUsingAsCollateral(reserve.id))
            return;

        if (useAsCollateral) {
            userConfig.setUsingAsCollateral(reserve.id, true);
            emit ReserveUsedAsCollateralEnabled(asset, msg.sender);
        } else {
            require(auctionedBalance == 0, Errors.AUCTIONED_BALANCE_NOT_ZERO);
            userConfig.setUsingAsCollateral(reserve.id, false);
            ValidationLogic.validateHFAndLtv(
                reservesData,
                reservesList,
                userConfig,
                asset,
                msg.sender,
                reservesCount,
                priceOracle
            );

            emit ReserveUsedAsCollateralDisabled(asset, msg.sender);
        }
    }

    /**
     * @notice Executes the 'set as collateral' feature. A user can choose to activate or deactivate an asset as
     * collateral at any point in time. Deactivating an asset as collateral is subjected to the usual health factor
     * checks to ensure collateralization.
     * @dev Emits the `ReserveUsedAsCollateralEnabled()` event if the asset can be activated as collateral.
     * @dev In case the asset is being deactivated as collateral, `ReserveUsedAsCollateralDisabled()` is emitted.
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param userConfig The users configuration mapping that track the supplied/borrowed assets
     * @param asset The address of the asset being configured as collateral
     * @param useAsCollateral True if the user wants to set the asset as collateral, false otherwise
     * @param reservesCount The number of initialized reserves
     * @param priceOracle The address of the price oracle
     */
    function executeUseERC721AsCollateral(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap storage userConfig,
        address asset,
        uint256 tokenId,
        bool useAsCollateral,
        uint256 reservesCount,
        address priceOracle
    ) external {
        DataTypes.ReserveData storage reserve = reservesData[asset];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        (
            bool valid,
            address owner,
            uint256 collaterizedBalance
        ) = ICollaterizableERC721(reserveCache.xTokenAddress)
                .setIsUsedAsCollateral(tokenId, useAsCollateral);

        if (valid) {
            ValidationLogic.validateSetUseERC721AsCollateral(
                reserveCache,
                msg.sender,
                owner
            );

            if (useAsCollateral) {
                if (collaterizedBalance == 1) {
                    userConfig.setUsingAsCollateral(reserve.id, true);
                    emit ReserveUsedAsCollateralEnabled(asset, msg.sender);
                }
                // TODO emit event
            } else {
                if (collaterizedBalance == 0) {
                    userConfig.setUsingAsCollateral(reserve.id, false);
                    emit ReserveUsedAsCollateralDisabled(asset, msg.sender);
                }
                ValidationLogic.validateHFAndLtv(
                    reservesData,
                    reservesList,
                    userConfig,
                    asset,
                    msg.sender,
                    reservesCount,
                    priceOracle
                );
            }
        } else {
            return;
        }
    }
}
