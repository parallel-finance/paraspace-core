// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "../dependencies/yoga-labs/ApeCoinStaking.sol";
import "./IParaApeStaking.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

/**
 * @title IPoolApeStaking
 *
 * @notice Defines the basic interface for an ParaSpace Ape Staking Pool.
 **/
interface IPoolApeStaking {
    /**
     * @notice return ParaApeStaking contract address
     */
    function paraApeStaking() external view returns (address);

    /**
     * @notice Borrow cApe from lending pool, only ParaApeStaking contract can call this function
     * @param amount Borrow amount of cApe from lending pool
     */
    function borrowPoolCApe(uint256 amount) external returns (uint256);

    /**
     * @notice Borrow ApeCoin/cApe from lending pool and stake ape in ParaApeStaking apecoin pool
     * @param apeCoinDepositInfo Detail deposit info of the apecoin pool
     * @param pairDepositInfo Detail deposit info of the apecoin pair pool
     * @param asset address of deposit asset, can be ApeCoin or cApe
     * @param cashAmount deposit amount from user wallet
     * @param borrowAmount Borrow amount of ApeCoin/cApe from lending pool
     * @dev Need check User health factor > 1.
     */
    function borrowAndStakingApeCoin(
        IParaApeStaking.ApeCoinDepositInfo[] calldata apeCoinDepositInfo,
        IParaApeStaking.ApeCoinPairDepositInfo[] calldata pairDepositInfo,
        address asset,
        uint256 cashAmount,
        uint256 borrowAmount,
        bool openSApeCollateralFlag
    ) external;

    /**
     * @notice calculate TimeLock parameters for the specified asset, only ParaApeStaking contract can call this function
     */
    function calculateTimeLockParams(address asset, uint256 amount)
        external
        returns (DataTypes.TimeLockParams memory);
}
