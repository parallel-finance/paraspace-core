// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import "../openzeppelin/contracts/StorageSlot.sol";
import "./interfaces/IStakefishValidatorFactory.sol";
import "./interfaces/IStakefishNFTManager.sol";

/// @title Abstract base contract StakefishValidatorBase
/// @notice Inherited by StakefishValidatorWallet (the proxy) and the implementation contract, both reading from the same slots - which is stored at the proxy level.
abstract contract StakefishValidatorBase {

    /// @dev We use slots so that these cannot be overriden by implementation contract
    bytes32 internal constant _FACTORY_SLOT = keccak256('stakefish.nftvalidator.factory');
    bytes32 internal constant _NFT_MANAGER_SLOT = keccak256('stakefish.nftvalidator.nftmanager');

    /// @dev do not declare any state variables (non constant) here. unknown side effects due to proxy/inheritance

    modifier isNFTOwner() {
        require(getNFTOwner() == msg.sender, "not nft owner");
        _;
    }

    modifier operatorOnly() {
        require(IStakefishValidatorFactory(StorageSlot.getAddressSlot(_FACTORY_SLOT).value).operatorAddress() == msg.sender, "not stakefish operator");
        _;
    }

    modifier isNFTMultiCallOrNFTOwner() {
        require(getNFTOwner() == msg.sender || isNFTMulticall(), "not nft owner or multicall");
        _;
    }

    function isNFTMulticall() internal view returns (bool) {
        return StorageSlot.getAddressSlot(_NFT_MANAGER_SLOT).value == msg.sender && getNFTOwner() == tx.origin;
    }

    function getNFTOwner() public view returns (address) {
        return IStakefishNFTManager(StorageSlot.getAddressSlot(_NFT_MANAGER_SLOT).value).validatorOwner(address(this));
    }

    function getProtocolFee() public view returns (uint256) {
        return IStakefishValidatorFactory(StorageSlot.getAddressSlot(_FACTORY_SLOT).value).protocolFee();
    }
}
