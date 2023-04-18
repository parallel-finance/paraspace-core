// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {DataTypes} from "../types/DataTypes.sol";
import {Errors} from "../helpers/Errors.sol";
import {SupplyLogic} from "./SupplyLogic.sol";
import {BorrowLogic} from "./BorrowLogic.sol";
import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";
import {UserConfiguration} from "../configuration/UserConfiguration.sol";
import {Math} from "../../../dependencies/openzeppelin/contracts/Math.sol";
import {Helpers} from "../helpers/Helpers.sol";

library PoolExtendedLogic {
    using Math for uint256;
    using UserConfiguration for DataTypes.UserConfigurationMap;

    event ReserveUsedAsCollateralEnabled(
        address indexed reserve,
        address indexed user
    );

    function repayAndSupplyForUser(
        DataTypes.PoolStorage storage ps,
        address asset,
        address payer,
        address onBehalfOf,
        uint256 totalAmount
    ) external {
        address variableDebtTokenAddress = ps
            ._reserves[asset]
            .variableDebtTokenAddress;
        uint256 repayAmount = Math.min(
            IERC20(variableDebtTokenAddress).balanceOf(onBehalfOf),
            totalAmount
        );
        repayForUser(ps, asset, payer, onBehalfOf, repayAmount);
        supplyForUser(ps, asset, payer, onBehalfOf, totalAmount - repayAmount);
    }

    function supplyForUser(
        DataTypes.PoolStorage storage ps,
        address asset,
        address payer,
        address onBehalfOf,
        uint256 amount
    ) public {
        if (amount == 0) {
            return;
        }
        DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
            onBehalfOf
        ];
        SupplyLogic.executeSupply(
            ps._reserves,
            userConfig,
            DataTypes.ExecuteSupplyParams({
                asset: asset,
                amount: amount,
                onBehalfOf: onBehalfOf,
                payer: payer,
                referralCode: 0
            })
        );
        Helpers.setAssetUsedAsCollateral(
            userConfig,
            ps._reserves,
            asset,
            onBehalfOf
        );
    }

    function repayForUser(
        DataTypes.PoolStorage storage ps,
        address asset,
        address payer,
        address onBehalfOf,
        uint256 amount
    ) public returns (uint256) {
        if (amount == 0) {
            return 0;
        }
        return
            BorrowLogic.executeRepay(
                ps._reserves,
                ps._usersConfig[onBehalfOf],
                DataTypes.ExecuteRepayParams({
                    asset: asset,
                    amount: amount,
                    onBehalfOf: onBehalfOf,
                    payer: payer,
                    usePTokens: false
                })
            );
    }
}
