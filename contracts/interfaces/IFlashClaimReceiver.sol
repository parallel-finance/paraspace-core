// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

/**
 * @title IFlashClaimReceiver interface
 * @notice Interface for the IFlashClaimReceiver.
 * @author ParaSpace
 * @dev implement this interface to develop a flashclaim-compatible flashclaimReceiver contract
 **/
interface IFlashClaimReceiver {
    function executeOperation(
        address asset,
        uint256[] calldata tokenIds,
        bytes calldata params
    ) external returns (bool);
}
