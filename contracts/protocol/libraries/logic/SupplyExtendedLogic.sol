// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";
import {GPv2SafeERC20} from "../../../dependencies/gnosis/contracts/GPv2SafeERC20.sol";
import {INToken} from "../../../interfaces/INToken.sol";
import {ICollateralizableERC721} from "../../../interfaces/ICollateralizableERC721.sol";
import {UserConfiguration} from "../configuration/UserConfiguration.sol";
import {DataTypes} from "../types/DataTypes.sol";
import {WadRayMath} from "../math/WadRayMath.sol";
import {PercentageMath} from "../math/PercentageMath.sol";
import {ValidationLogic} from "./ValidationLogic.sol";
import {ReserveLogic} from "./ReserveLogic.sol";

/**
 * @title SupplyLogic library
 *
 * @notice Implements the base logic for supply/withdraw
 */
library SupplyExtendedLogic {
    using ReserveLogic for DataTypes.ReserveData;
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

    /**
     * @notice Validates a transfer of PTokens. The sender is subjected to health factor validation to avoid
     * collateralization constraints violation.
     * @dev Emits the `ReserveUsedAsCollateralEnabled()` event for the `to` account, if the asset is being activated as
     * collateral.
     * @dev In case the `from` user transfers everything, `ReserveUsedAsCollateralDisabled()` is emitted for `from`.
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param usersConfig The users configuration mapping that track the supplied/borrowed assets
     * @param params The additional parameters needed to execute the finalizeTransfer function
     */
    function executeFinalizeTransferERC20(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        mapping(address => DataTypes.UserConfigurationMap) storage usersConfig,
        DataTypes.FinalizeTransferParams memory params
    ) external {
        DataTypes.ReserveData storage reserve = reservesData[params.asset];

        ValidationLogic.validateTransferERC20(reserve);

        uint256 reserveId = reserve.id;

        if (params.from != params.to && params.amount != 0) {
            DataTypes.UserConfigurationMap storage fromConfig = usersConfig[
                params.from
            ];

            if (fromConfig.isUsingAsCollateral(reserveId)) {
                if (fromConfig.isBorrowingAny()) {
                    ValidationLogic.validateHFAndLtvERC20(
                        reservesData,
                        reservesList,
                        usersConfig[params.from],
                        params.asset,
                        params.from,
                        params.reservesCount,
                        params.oracle
                    );
                }

                if (params.balanceFromBefore == params.amount) {
                    fromConfig.setUsingAsCollateral(reserveId, false);
                    emit ReserveUsedAsCollateralDisabled(
                        params.asset,
                        params.from
                    );
                }

                if (params.balanceToBefore == 0) {
                    DataTypes.UserConfigurationMap
                        storage toConfig = usersConfig[params.to];

                    toConfig.setUsingAsCollateral(reserveId, true);
                    emit ReserveUsedAsCollateralEnabled(
                        params.asset,
                        params.to
                    );
                }
            }
        }
    }

    /**
     * @notice Validates a transfer of NTokens. The sender is subjected to health factor validation to avoid
     * collateralization constraints violation.
     * @dev In case the `from` user transfers everything, `ReserveUsedAsCollateralDisabled()` is emitted for `from`.
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param usersConfig The users configuration mapping that track the supplied/borrowed assets
     * @param params The additional parameters needed to execute the finalizeTransfer function
     */
    function executeFinalizeTransferERC721(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        mapping(address => DataTypes.UserConfigurationMap) storage usersConfig,
        DataTypes.FinalizeTransferERC721Params memory params
    ) external {
        DataTypes.ReserveData storage reserve = reservesData[params.asset];

        ValidationLogic.validateTransferERC721(
            reservesData,
            reserve,
            params.asset,
            params.tokenId
        );

        uint256 reserveId = reserve.id;

        if (params.from != params.to) {
            DataTypes.UserConfigurationMap storage fromConfig = usersConfig[
                params.from
            ];

            if (params.usedAsCollateral) {
                if (fromConfig.isBorrowingAny()) {
                    uint256[] memory tokenIds = new uint256[](1);
                    tokenIds[0] = params.tokenId;
                    ValidationLogic.validateHFAndLtvERC721(
                        reservesData,
                        reservesList,
                        usersConfig[params.from],
                        params.asset,
                        tokenIds,
                        params.from,
                        params.reservesCount,
                        params.oracle
                    );
                }

                if (params.balanceFromBefore == 1) {
                    fromConfig.setUsingAsCollateral(reserveId, false);
                    emit ReserveUsedAsCollateralDisabled(
                        params.asset,
                        params.from
                    );
                }
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
    function executeUseERC20AsCollateral(
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

        uint256 userBalance = IERC20(reserveCache.xTokenAddress).balanceOf(
            msg.sender
        );

        ValidationLogic.validateSetUseERC20AsCollateral(
            reserveCache,
            userBalance
        );

        if (useAsCollateral == userConfig.isUsingAsCollateral(reserve.id))
            return;

        if (useAsCollateral) {
            userConfig.setUsingAsCollateral(reserve.id, true);
            emit ReserveUsedAsCollateralEnabled(asset, msg.sender);
        } else {
            userConfig.setUsingAsCollateral(reserve.id, false);
            if (userConfig.isBorrowingAny()) {
                ValidationLogic.validateHFAndLtvERC20(
                    reservesData,
                    reservesList,
                    userConfig,
                    asset,
                    msg.sender,
                    reservesCount,
                    priceOracle
                );
            }

            emit ReserveUsedAsCollateralDisabled(asset, msg.sender);
        }
    }

    /**
     * @notice Executes the 'set as collateral' feature. A user can choose to activate an asset as
     * collateral at any point in time.
     * @dev Emits the `ReserveUsedAsCollateralEnabled()` event if the asset can be activated as collateral.
     * @param reservesData The state of all the reserves
     * @param userConfig The users configuration mapping that track the supplied/borrowed assets
     * @param asset The address of the asset being configured as collateral
     * @param tokenIds The ids of the supplied ERC721 token
     * @param sender The address of NFT owner
     */
    function executeCollateralizeERC721(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        DataTypes.UserConfigurationMap storage userConfig,
        address asset,
        uint256[] calldata tokenIds,
        address sender
    ) external {
        DataTypes.ReserveData storage reserve = reservesData[asset];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        ValidationLogic.validateSetUseERC721AsCollateral(
            reservesData,
            reserveCache,
            asset,
            tokenIds
        );

        (
            uint256 oldCollateralizedBalance,
            uint256 newCollateralizedBalance
        ) = ICollateralizableERC721(reserveCache.xTokenAddress)
                .batchSetIsUsedAsCollateral(tokenIds, true, sender);

        if (oldCollateralizedBalance == 0 && newCollateralizedBalance != 0) {
            userConfig.setUsingAsCollateral(reserve.id, true);
            emit ReserveUsedAsCollateralEnabled(asset, sender);
        }
    }

    /**
     * @notice Executes the 'set as collateral' feature. A user can choose to deactivate an asset as
     * collateral at any point in time. Deactivating an asset as collateral is subjected to the usual health factor
     * checks to ensure collateralization.
     * @dev Emits the `ReserveUsedAsCollateralDisabled()` event if the asset can be deactivated as collateral.
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param userConfig The users configuration mapping that track the supplied/borrowed assets
     * @param asset The address of the asset being configured as collateral
     * @param tokenIds The ids of the supplied ERC721 token
     * @param sender The address of NFT owner
     * @param reservesCount The number of initialized reserves
     * @param priceOracle The address of the price oracle
     */
    function executeUncollateralizeERC721(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap storage userConfig,
        address asset,
        uint256[] calldata tokenIds,
        address sender,
        uint256 reservesCount,
        address priceOracle
    ) external {
        DataTypes.ReserveData storage reserve = reservesData[asset];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        ValidationLogic.validateSetUseERC721AsCollateral(
            reservesData,
            reserveCache,
            asset,
            tokenIds
        );

        (
            uint256 oldCollateralizedBalance,
            uint256 newCollateralizedBalance
        ) = ICollateralizableERC721(reserveCache.xTokenAddress)
                .batchSetIsUsedAsCollateral(tokenIds, false, sender);

        if (oldCollateralizedBalance == newCollateralizedBalance) {
            return;
        }

        if (newCollateralizedBalance == 0) {
            userConfig.setUsingAsCollateral(reserve.id, false);
            emit ReserveUsedAsCollateralDisabled(asset, sender);
        }
        if (userConfig.isBorrowingAny()) {
            ValidationLogic.validateHFAndLtvERC721(
                reservesData,
                reservesList,
                userConfig,
                asset,
                tokenIds,
                sender,
                reservesCount,
                priceOracle
            );
        }
    }
}
