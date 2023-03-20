pragma solidity ^0.8.10;
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

interface ITimeLockStrategy {
    function calculateTimeLockParams(
        DataTypes.TimeLockFactorParams calldata params
    ) external view returns (DataTypes.TimeLockParams memory);
}
