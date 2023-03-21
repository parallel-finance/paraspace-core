// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.10;

import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

// ITimeLockStrategy defines an interface for implementing custom time lock strategies.
interface ITimeLockStrategy {
    /**
     * @dev Calculates the time lock parameters based on the provided factor params.
     *
     * @param params The TimeLockFactorParams struct containing relevant information to calculate time lock params.
     * @return A TimeLockParams struct containing the calculated time lock parameters.
     */
    function calculateTimeLockParams(
        DataTypes.TimeLockFactorParams calldata params
    ) external returns (DataTypes.TimeLockParams memory);
}
