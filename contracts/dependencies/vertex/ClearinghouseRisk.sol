// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./interfaces/engine/IProductEngine.sol";
import "./interfaces/clearinghouse/IClearinghouseState.sol";
import "./common/Constants.sol";
import "./common/Errors.sol";

import "./libraries/MathHelper.sol";
import "./libraries/MathSD21x18.sol";
import "./EndpointGated.sol";
import "./libraries/RiskHelper.sol";

abstract contract ClearinghouseRisk is IClearinghouseState, EndpointGated {
    using MathSD21x18 for int128;

    uint32 maxHealthGroup;
    mapping(uint32 => HealthGroup) healthGroups; // deprecated
    mapping(uint32 => RiskStore) risks;

    function getMaxHealthGroup() external view returns (uint32) {
        return maxHealthGroup;
    }

    function getRisk(uint32 productId)
        public
        view
        returns (RiskHelper.Risk memory)
    {
        RiskStore memory risk = risks[productId];
        return
            RiskHelper.Risk({
                longWeightInitialX18: int128(risk.longWeightInitial) * 1e9,
                shortWeightInitialX18: int128(risk.shortWeightInitial) * 1e9,
                longWeightMaintenanceX18: int128(risk.longWeightMaintenance) *
                    1e9,
                shortWeightMaintenanceX18: int128(risk.shortWeightMaintenance) *
                    1e9,
                largePositionPenaltyX18: int128(risk.largePositionPenalty) * 1e9
            });
    }

    function getLiqPriceX18(uint32 productId, int128 amount)
        internal
        view
        returns (int128)
    {
        RiskHelper.Risk memory risk = getRisk(productId);
        return
            getOraclePriceX18(productId).mul(
                ONE +
                    (RiskHelper._getWeightX18(
                        risk,
                        amount,
                        IProductEngine.HealthType.MAINTENANCE
                    ) - ONE) /
                    5
            );
    }

    function getSpreadLiqPriceX18(HealthGroup memory healthGroup, int128 amount)
        internal
        view
        returns (int128)
    {
        RiskHelper.Risk memory spotRisk = getRisk(healthGroup.spotId);
        RiskHelper.Risk memory perpRisk = getRisk(healthGroup.perpId);
        int128 spreadPenaltyX18 = RiskHelper._getSpreadPenaltyX18(
            spotRisk,
            perpRisk,
            MathHelper.abs(amount),
            IProductEngine.HealthType.MAINTENANCE
        ) / 5;
        if (amount > 0) {
            return
                getOraclePriceX18(healthGroup.spotId).mul(
                    ONE - spreadPenaltyX18
                );
        } else {
            return
                getOraclePriceX18(healthGroup.spotId).mul(
                    ONE + spreadPenaltyX18
                );
        }
    }
}
