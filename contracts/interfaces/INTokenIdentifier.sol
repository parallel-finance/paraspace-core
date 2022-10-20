// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

/**
 * @title INTokenIdentifier
 * @author ParallelFi
 * @notice Defines the basic interface for an INTokenIdentifier.
 **/
interface INTokenIdentifier {
    function getNTokenIdentifier() external pure returns (string memory);
}
