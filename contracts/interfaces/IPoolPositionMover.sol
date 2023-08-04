// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

/**
 * @title IPool
 *
 * @notice Defines the basic interface for an ParaSpace Pool.
 **/
interface IPoolPositionMover {
    function movePositionFromBendDAO(uint256[] calldata loanIds) external;
}
