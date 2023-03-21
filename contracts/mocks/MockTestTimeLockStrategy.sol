// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import "../interfaces/ITimeLockStrategy.sol";

contract MockTestTimeLockStrategy is ITimeLockStrategy {
    function calculateTimeLockParams(
        DataTypes.TimeLockFactorParams calldata params
    ) external view returns (DataTypes.TimeLockParams memory) {
        DataTypes.TimeLockParams memory timeLockParams;

        return timeLockParams;
    }
}