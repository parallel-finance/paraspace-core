// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../dependencies/openzeppelin/contracts/ReentrancyGuard.sol";
import "../../dependencies/openzeppelin/contracts//Pausable.sol";
import "../../dependencies/openzeppelin/contracts/Address.sol";
import "./IVaultCommon.sol";

contract VaultCommon is ReentrancyGuard, Pausable, IVaultCommon {
    /**
     * @dev Receives and executes a batch of function calls on this contract.
     */
    function multicall(
        bytes[] calldata data
    ) external virtual returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            results[i] = Address.functionDelegateCall(address(this), data[i]);
        }
        return results;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
