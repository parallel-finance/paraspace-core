// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

/**
 * @title IPool
 *
 * @notice Defines the basic interface for an ParaSpace Pool.
 **/
interface IPoolAAPositionMover {
    function positionMoveToAA(
        address[] calldata users,
        uint256[] calldata salts
    ) external returns (address[] memory);
}
