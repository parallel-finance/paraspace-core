// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IVaultCommon {
    /**
     * @notice Pauses the contract. Only pool admin or emergency admin can call this function
     **/
    function pause() external;

    /**
     * @notice Unpause the contract. Only pool admin can call this function
     **/
    function unpause() external;

    /**
     * @dev Receives and executes a batch of function calls on this contract.
     */
    function multicall(
        bytes[] calldata data
    ) external returns (bytes[] memory results);
}
