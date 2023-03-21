// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import "../interfaces/ITimeLockStrategy.sol";

contract DefaultTimeLockStrategy is ITimeLockStrategy {
    uint256 public immutable MIN_THRESHOLD;
    uint256 public immutable MID_THRESHOLD;

    uint48 public immutable MIN_WAIT_TIME;
    uint48 public immutable MID_WAIT_TIME;
    uint48 public immutable MAX_WAIT_TIME;

    uint48 public immutable POOL_PERIOD_RATE_WAIT_TIME;
    uint256 public immutable POOL_PERIOD_LIMIT;
    uint256 public immutable PERIOD;

    uint128 public totalAmountInCurrentPeriod;
    uint48 public lastResetTimestamp;

    event PeriodReset();

    constructor(
        uint256 minThreshold,
        uint256 midThreshold,
        uint48 minWaitTime,
        uint48 midWaitTime,
        uint48 maxWaitTime,
        uint256 poolPeriodLimit,
        uint48 poolPeriodWaitTime,
        uint256 period
    ) {
        MIN_THRESHOLD = minThreshold;
        MID_THRESHOLD = midThreshold;

        MIN_WAIT_TIME = minWaitTime;
        MID_WAIT_TIME = midWaitTime;
        MAX_WAIT_TIME = maxWaitTime;

        POOL_PERIOD_LIMIT = poolPeriodLimit;
        POOL_PERIOD_RATE_WAIT_TIME = poolPeriodWaitTime;
        PERIOD = period;
    }

    function _updatePeriodLimit(uint48 currentTimestamp, uint128 amount)
        internal
        returns (uint48 extraDelay)
    {
        if (currentTimestamp - lastResetTimestamp >= PERIOD) {
            totalAmountInCurrentPeriod = 0;
            lastResetTimestamp = currentTimestamp;
            emit PeriodReset();
        }

        uint256 newTotalAmountInCurrentPeriod = totalAmountInCurrentPeriod +
            amount;
        totalAmountInCurrentPeriod = uint128(newTotalAmountInCurrentPeriod);

        if (newTotalAmountInCurrentPeriod > POOL_PERIOD_LIMIT) {
            extraDelay = POOL_PERIOD_RATE_WAIT_TIME;
        }
    }

    function calculateTimeLockParams(
        DataTypes.TimeLockFactorParams calldata params
    ) external returns (DataTypes.TimeLockParams memory) {
        uint48 currentTimestamp = uint48(block.timestamp);
        DataTypes.TimeLockParams memory timeLockParams;

        timeLockParams.releaseTime +=
            currentTimestamp +
            _updatePeriodLimit(currentTimestamp, uint128(params.amount));

        if (params.amount < MIN_THRESHOLD) {
            timeLockParams.releaseTime += MIN_WAIT_TIME;
        } else if (params.amount < MID_THRESHOLD) {
            timeLockParams.releaseTime += MID_WAIT_TIME;
        } else {
            timeLockParams.releaseTime += MAX_WAIT_TIME;
        }

        return timeLockParams;
    }
}
