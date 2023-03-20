// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../interfaces/ITimeLockStrategy.sol";

contract MockTestTimeLockStrategy is ITimeLockStrategy {
    uint256 immutable MIN_THRESHOLD;
    uint256 immutable MID_THRESHOLD;

    uint256 immutable MIN_WAIT_TIME;
    uint256 immutable MID_WAIT_TIME;
    uint256 immutable MAX_WAIT_TIME;

    constructor(
        uint256 minThreshold,
        uint256 midThreshold,
        uint256 minWaitTime,
        uint256 midWaitTime,
        uint256 maxWaitTime
    ) {
        MIN_THRESHOLD = minThreshold;
        MID_THRESHOLD = midThreshold;

        MIN_WAIT_TIME = minWaitTime;
        MID_WAIT_TIME = midWaitTime;
        MAX_WAIT_TIME = maxWaitTime;
    }

    function calculateTimeLockParams(
        DataTypes.TimeLockFactorParams calldata params
    ) external view returns (DataTypes.TimeLockParams memory) {
        DataTypes.TimeLockParams memory timeLockParams;

        if (params.amount < MIN_THRESHOLD) {
            timeLockParams.releaseTime = MIN_WAIT_TIME;
        } else if (params.amount < MID_THRESHOLD) {
            timeLockParams.releaseTime = MID_WAIT_TIME;
        } else {
            timeLockParams.releaseTime = MAX_WAIT_TIME;
        }

        return timeLockParams;
    }
}
