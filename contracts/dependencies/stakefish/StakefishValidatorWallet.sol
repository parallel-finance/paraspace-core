// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;


import "../openzeppelin/upgradeability/Proxy.sol";
import "../openzeppelin/contracts/StorageSlot.sol";

import "./library/ERC1976Thin.sol";
import "./StakefishValidatorBase.sol";
import "./interfaces/IStakefishValidatorFactory.sol";
import "./interfaces/IStakefishValidatorWallet.sol";
import "./interfaces/IStakefishNFTManager.sol";

/// @title The contract representing the owner-upgradable immutable layer
/// @notice This contract is immutable and tracks the owner accurately based on
/// its ability to know its relationship with the NFT issuer.
contract StakefishValidatorWallet is StakefishValidatorBase, IStakefishValidatorWallet, Proxy, ERC1976 {

    function initialize(address factory_, address nftManager_) external payable {
        require(factory_ == msg.sender, "only factory allowed to initialize");
        require(nftManager_ != address(0), "manager may not be null");
        require(StorageSlot.getAddressSlot(_NFT_MANAGER_SLOT).value == address(0), "initialized already");
        require(StorageSlot.getAddressSlot(_FACTORY_SLOT).value == address(0), "initialized already");

        StorageSlot.getAddressSlot(_FACTORY_SLOT).value = factory_;
        StorageSlot.getAddressSlot(_NFT_MANAGER_SLOT).value = nftManager_;
        StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value = IStakefishValidatorFactory(factory_).latestVersion();
    }

    function getNFTManager() external view returns (address) {
        return StorageSlot.getAddressSlot(_NFT_MANAGER_SLOT).value;
    }

    function _implementation() internal view virtual override returns (address impl) {
        return ERC1976._getImplementation();
    }

    function upgradeLatestByNFTOwner() external override isNFTMultiCallOrNFTOwner {
        address implementation = IStakefishValidatorFactory(StorageSlot.getAddressSlot(_FACTORY_SLOT).value).latestVersion();
        _upgradeTo(implementation);
    }

    /// @dev receives staking withdrawals
    receive() external override(IStakefishValidatorWallet, Proxy) payable {
    }

    /// @dev This function only works if user approves NFT to the new nft manager in order to call nftManager.claim()
    function migrate(address newManager) external override isNFTMultiCallOrNFTOwner {
        require(IStakefishValidatorFactory(StorageSlot.getAddressSlot(_FACTORY_SLOT).value).migrationAddress() == newManager, "migration not allowed");

        IStakefishNFTManager oldNFTManager = IStakefishNFTManager(StorageSlot.getAddressSlot(_NFT_MANAGER_SLOT).value);
        address owner = oldNFTManager.validatorOwner(address(this));
        uint256 tokenId = oldNFTManager.tokenForValidatorAddr(address(this));

        // change to the newManager
        StorageSlot.getAddressSlot(_NFT_MANAGER_SLOT).value = newManager;

        // get new tokenId assigned in newNFTManager & burn the token
        IStakefishNFTManager(newManager).claim(address(oldNFTManager), tokenId);

        // check newManager provides validatorOwner we need!
        require(IStakefishNFTManager(newManager).validatorOwner(address(this)) == owner, "Non-matching owner on new manager");

    }
}
