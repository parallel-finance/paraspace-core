// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../openzeppelin/upgradeability/Clones.sol";
import "../openzeppelin/contracts/Ownable.sol";

import './interfaces/IStakefishValidatorFactory.sol';
import './interfaces/IStakefishValidator.sol';

import './StakefishValidatorWallet.sol';

contract StakefishValidatorFactory is IStakefishValidatorFactory, Ownable {

    /// @dev prevent front-running - attacker creating with future tokenId and
    /// break the functionality with the caller (NFTManager)
    mapping(address => bool) private _approvedDeployers;

    /// @dev instance of wallet contract for EIP-1167 minimal proxy cloning
    address private _walletClonable;

    /// @dev list of verified contracts
    address[] public override implementations;

    /// @dev stakefish operator
    address public override operatorAddress;

    /// @dev migration address
    address public override migrationAddress;

    /// @dev protocol fee
    uint256 public override protocolFee = 1500;

    /// @dev max number of validators that can be created per transaction
    uint256 public override maxValidatorsPerTransaction = 30;

    constructor(address genesisImplementation, address _operatorAddress) {
        _walletClonable = address(new StakefishValidatorWallet());
        implementations.push(genesisImplementation);
        operatorAddress = _operatorAddress;
    }

    /// @dev expect this to be called from smart contract
    /// msg.sender is the deployer of the contract
    /// msg.value is forwarded to the validator wallet
    function createValidator(uint256 tokenId) external override payable returns (address validator) {
        // deploy to an existing contract should fail
        require(_approvedDeployers[msg.sender], "only approved deployer allowed");
        bytes32 salt = keccak256(abi.encodePacked(msg.sender, address(this), tokenId));
        validator = Clones.cloneDeterministic(_walletClonable, salt);
        StakefishValidatorWallet(payable(validator)).initialize{value: msg.value}(address(this), msg.sender);
        IStakefishValidator(validator).setup();
    }

    /// WRITE OWNER-ONLY FUNCTIONS
    function setOperator(address _operator) external override onlyOwner() {
        operatorAddress = _operator;
    }

    function setDeployer(address deployer, bool enabled) external override onlyOwner() {
        _approvedDeployers[deployer] = enabled;
    }

    function setFee(uint256 _feePercent) external override onlyOwner() {
        require(_feePercent <= 10000, "Must be under between 0 and 100%");
        protocolFee = _feePercent;
    }

    function setMigrationAddress(address _migrationAddress) external override onlyOwner() {
        migrationAddress = _migrationAddress;
    }

    function setMaxValidatorsPerTransaction(uint256 maxCount) external override onlyOwner {
        require(maxCount > 0, "max count must be at least 1");
        maxValidatorsPerTransaction = maxCount;
    }

    function addVersion(address implementation) external override onlyOwner() {
        implementations.push(implementation);
    }

    function withdraw() external override onlyOwner() {
        Address.sendValue(payable(msg.sender), address(this).balance);
    }

    /// READ FUNCTIONS
    function latestVersion() external override view returns (address) {
        return implementations[implementations.length-1];
    }

    function computeAddress(address deployer, uint256 tokenId) external override view returns (address validator) {
        bytes32 salt = keccak256(abi.encodePacked(deployer, address(this), tokenId));
        return Clones.predictDeterministicAddress(_walletClonable, salt);
    }

    /// @dev receives protocol rewards
    receive() payable external {
    }
}
