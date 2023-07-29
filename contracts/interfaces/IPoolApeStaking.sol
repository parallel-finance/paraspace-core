// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import "../dependencies/yoga-labs/ApeCoinStaking.sol";
import "./IParaApeStaking.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

/**
 * @title IPoolApeStaking
 *
 * @notice Defines the basic interface for an ParaSpace Ape Staking Pool.
 **/
interface IPoolApeStaking {
    function paraApeStaking() external view returns (address);

    function borrowPoolCApe(uint256 amount) external returns (uint256);

    function borrowAndStakingApeCoin(
        IParaApeStaking.ApeCoinDepositInfo[] calldata apeCoinDepositInfo,
        IParaApeStaking.ApeCoinPairDepositInfo[] calldata pairDepositInfo,
        address borrowAsset,
        uint256 borrowAmount,
        bool openSApeCollateralFlag
    ) external;

    function calculateTimeLockParams(address asset, uint256 amount)
        external
        returns (DataTypes.TimeLockParams memory);
}
