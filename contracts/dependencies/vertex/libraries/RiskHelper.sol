// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;
import "./MathSD21x18.sol";
import "../interfaces/engine/IProductEngine.sol";
import "../common/Constants.sol";
import "./MathHelper.sol";

/// @title RiskHelper
/// @dev Provides basic math functions
library RiskHelper {
    using MathSD21x18 for int128;

    struct Risk {
        int128 longWeightInitialX18;
        int128 shortWeightInitialX18;
        int128 longWeightMaintenanceX18;
        int128 shortWeightMaintenanceX18;
        int128 largePositionPenaltyX18;
    }

    function _getSpreadPenaltyX18(
        Risk memory spotRisk,
        Risk memory perpRisk,
        int128 amount,
        IProductEngine.HealthType healthType
    ) internal pure returns (int128 spreadPenaltyX18) {
        if (amount >= 0) {
            spreadPenaltyX18 =
                (ONE - _getWeightX18(perpRisk, amount, healthType)) /
                5;
        } else {
            spreadPenaltyX18 =
                (_getWeightX18(spotRisk, amount, healthType) - ONE) /
                5;
        }
    }

    function _getWeightX18(
        Risk memory risk,
        int128 amount,
        IProductEngine.HealthType healthType
    ) internal pure returns (int128) {
        // (1 + imf * sqrt(amount))
        if (healthType == IProductEngine.HealthType.PNL) {
            return ONE;
        }

        int128 weight;
        if (amount >= 0) {
            weight = healthType == IProductEngine.HealthType.INITIAL
                ? risk.longWeightInitialX18
                : risk.longWeightMaintenanceX18;
        } else {
            weight = healthType == IProductEngine.HealthType.INITIAL
                ? risk.shortWeightInitialX18
                : risk.shortWeightMaintenanceX18;
        }

        if (risk.largePositionPenaltyX18 > 0) {
            if (amount > 0) {
                // 1.1 / (1 + imf * sqrt(amount))
                int128 threshold_sqrt = (int128(11e17).div(weight) - ONE).div(
                    risk.largePositionPenaltyX18
                );
                if (amount.abs() > threshold_sqrt.mul(threshold_sqrt)) {
                    weight = int128(11e17).div(
                        ONE +
                            risk.largePositionPenaltyX18.mul(
                                amount.abs().sqrt()
                            )
                    );
                }
            } else {
                // 0.9 * (1 + imf * sqrt(amount))
                int128 threshold_sqrt = (weight.div(int128(9e17)) - ONE).div(
                    risk.largePositionPenaltyX18
                );
                if (amount.abs() > threshold_sqrt.mul(threshold_sqrt)) {
                    weight = int128(9e17).mul(
                        ONE +
                            risk.largePositionPenaltyX18.mul(
                                amount.abs().sqrt()
                            )
                    );
                }
            }
        }

        return weight;
    }
}
