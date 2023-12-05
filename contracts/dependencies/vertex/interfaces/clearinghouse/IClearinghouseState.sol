// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "../engine/IProductEngine.sol";
import "../IEndpoint.sol";
import "../../libraries/RiskHelper.sol";

interface IClearinghouseState {
    struct RiskStore {
        // these weights are all
        // between 0 and 2
        // these integers are the real
        // weights times 1e9
        int32 longWeightInitial;
        int32 shortWeightInitial;
        int32 longWeightMaintenance;
        int32 shortWeightMaintenance;
        int32 largePositionPenalty;
    }

    struct HealthGroup {
        uint32 spotId;
        uint32 perpId;
    }

    struct HealthVars {
        int128 spotAmount;
        int128 perpAmount;
        // 1 unit of basis amount is 1 unit long spot and 1 unit short perp
        int128 basisAmount;
        int128 spotInLpAmount;
        int128 perpInLpAmount;
        IEndpoint.Prices pricesX18;
        RiskHelper.Risk spotRisk;
        RiskHelper.Risk perpRisk;
    }

    function getMaxHealthGroup() external view returns (uint32);

    function getRisk(uint32 productId)
        external
        view
        returns (RiskHelper.Risk memory);
}
