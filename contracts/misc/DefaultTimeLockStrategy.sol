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

    uint256 public immutable MAX_POOL_PERIOD_RATE;
    uint256 public immutable PERIOD;
    address public immutable POOL;

    uint128 public totalAmountInCurrentPeriod;
    uint48 public lastResetTimestamp;

    event PeriodReset();

    modifier onlyPool() {
        require(msg.sender == POOL, "Only pool allowed");
        _;
    }

    constructor(
        address pool,
        uint256 minThreshold,
        uint256 midThreshold,
        uint48 minWaitTime,
        uint48 midWaitTime,
        uint48 maxWaitTime,
        uint256 maxPoolPeriodRate,
        uint48 maxPoolPeriodWaitTime,
        uint256 period
    ) {
        POOL = pool;
        MIN_THRESHOLD = minThreshold;
        MID_THRESHOLD = midThreshold;

        MIN_WAIT_TIME = minWaitTime;
        MID_WAIT_TIME = midWaitTime;
        MAX_WAIT_TIME = maxWaitTime;
        MAX_POOL_PERIOD_RATE = maxPoolPeriodRate;
        POOL_PERIOD_RATE_WAIT_TIME = maxPoolPeriodWaitTime;
        PERIOD = period;
    }

    function resetPeriodLimit() internal {
        totalAmountInCurrentPeriod = 0;
        lastResetTimestamp = uint48(block.timestamp);
    }

    function calculateTimeLockParams(
        DataTypes.TimeLockFactorParams calldata params
    ) external onlyPool returns (DataTypes.TimeLockParams memory) {
        uint256 currentTimestamp = block.timestamp;
        if (currentTimestamp - lastResetTimestamp >= PERIOD) {
            resetPeriodLimit();
            emit PeriodReset();
        }

        DataTypes.TimeLockParams memory timeLockParams;
        timeLockParams.releaseTime = uint48(currentTimestamp);

        uint256 updatedTotalAmount = totalAmountInCurrentPeriod + params.amount;
        totalAmountInCurrentPeriod = uint128(updatedTotalAmount);

        if (updatedTotalAmount > MAX_POOL_PERIOD_RATE) {
            timeLockParams.releaseTime += POOL_PERIOD_RATE_WAIT_TIME;
        }

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
