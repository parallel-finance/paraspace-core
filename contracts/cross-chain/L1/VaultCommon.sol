// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../dependencies/openzeppelin/contracts/ReentrancyGuard.sol";
import "../../dependencies/openzeppelin/contracts//Pausable.sol";
import "../../dependencies/openzeppelin/contracts/Address.sol";
import "../../interfaces/IACLManager.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import "./IVaultCommon.sol";

contract VaultCommon is ReentrancyGuard, Pausable, IVaultCommon {
    IACLManager private immutable aclManager;

    constructor(address _aclManager) {
        aclManager = IACLManager(_aclManager);
    }

    /// @inheritdoc IVaultCommon
    function pause() external onlyEmergencyOrPoolAdmin {
        _pause();
    }

    /// @inheritdoc IVaultCommon
    function unpause() external onlyPoolAdmin {
        _unpause();
    }

    /// @inheritdoc IVaultCommon
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

    /**
     * @dev Only pool admin can call functions marked by this modifier.
     **/
    modifier onlyPoolAdmin() {
        _onlyPoolAdmin();
        _;
    }

    /**
     * @dev Only emergency or pool admin can call functions marked by this modifier.
     **/
    modifier onlyEmergencyOrPoolAdmin() {
        _onlyPoolOrEmergencyAdmin();
        _;
    }

    function _onlyPoolAdmin() internal view {
        require(
            aclManager.isPoolAdmin(msg.sender),
            Errors.CALLER_NOT_POOL_ADMIN
        );
    }

    function _onlyPoolOrEmergencyAdmin() internal view {
        require(
            aclManager.isPoolAdmin(msg.sender) ||
                aclManager.isEmergencyAdmin(msg.sender),
            Errors.CALLER_NOT_POOL_OR_EMERGENCY_ADMIN
        );
    }
}
