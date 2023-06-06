// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../../openzeppelin/contracts/ReentrancyGuard.sol";
import "../../openzeppelin/upgradeability/Initializable.sol";

import "../interfaces/IStakefishTransactionFeePoolV2.sol";
import "../interfaces/IStakefishValidator.sol";
import "../interfaces/IDepositContract.sol";
import "../StakefishValidatorBase.sol";

/// @dev Delegatecall uses the same storage as the proxy, so we can lookup the _NFT_MANAGER_SLOT
contract StakefishValidatorV1 is StakefishValidatorBase, IStakefishValidator, Initializable, ReentrancyGuard {
    IDepositContract immutable depositContract; // immutable are constants, included in the code

    uint256 public validatorIndex;
    bytes public pubkey;
    StateChange[] public stateHistory;
    address public feePoolAddress;
    uint256 public withdrawnBalance;

    constructor(address _depositContract) initializer {
        /// @dev depositContract is immutable, stored like constants in the code
        depositContract = IDepositContract(_depositContract);
    }

    function setup() external override initializer() {
        pubkey = new bytes(48);
        stateHistory.push(StateChange(State.PreDeposit, 0x0, uint128(block.timestamp)));
        withdrawnBalance = 0;
    }

    function lastStateChange() external view override returns (StateChange memory ) {
        return stateHistory[stateHistory.length -1];
    }

    function makeEth2Deposit(
        bytes calldata validatorPubKey, // 48 bytes
        bytes calldata depositSignature, // 96 bytes
        bytes32 depositDataRoot
    ) external nonReentrant override operatorOnly {
        require(this.lastStateChange().state == State.PreDeposit, "Contract is not in PreDeposit state");
        require(validatorPubKey.length == 48, "Invalid validator public key");
        require(depositSignature.length == 96, "Invalid deposit signature");

        stateHistory.push(StateChange(State.PostDeposit, 0x0, uint128(block.timestamp)));
        pubkey = validatorPubKey;

        depositContract.deposit{value: 32 ether}(
            validatorPubKey,
            // withdraw credential is set to this contract address.
            // See: https://github.com/ethereum/consensus-specs/pull/2149 for specification.
            abi.encodePacked(uint96(0x010000000000000000000000), address(this)),
            depositSignature,
            depositDataRoot
        );

        emit StakefishValidatorDeposited(validatorPubKey);
    }

    function validatorStarted(
        uint256 _startTimestamp,
        uint256 _validatorIndex,
        address _feePoolAddress) external nonReentrant override operatorOnly
    {
        require(this.lastStateChange().state == State.PostDeposit, "Validator is not in PostDeposit state");
        stateHistory.push(StateChange(State.Active, 0x0, uint128(_startTimestamp)));
        validatorIndex = _validatorIndex;
        feePoolAddress = _feePoolAddress;
        emit StakefishValidatorStarted(pubkey, _startTimestamp);
    }

    function requestExit() external nonReentrant override isNFTOwner {
        require(this.lastStateChange().state == State.Active, "Validator is not running");
        stateHistory.push(StateChange(State.ExitRequested, 0x0, uint128(block.timestamp)));
        emit StakefishValidatorExitRequest(pubkey);
    }

    function validatorExited(uint256 _stopTimestamp) nonReentrant external override operatorOnly
    {
        require(this.lastStateChange().state == State.ExitRequested, "Validator exit not requested");
        stateHistory.push(StateChange(State.Exited, 0x0, uint128(_stopTimestamp)));
        emit StakefishValidatorExited(pubkey, _stopTimestamp);
    }

    /// @dev notes
    /// The first 32 eth are returned to the user, regardless of whether the validator had penalties.
    /// Above 32 eth, stakefish charges a commission based on a commission rate from getProtocolFee().
    /// This wallet can possibly be used as the validator fee recipient address to allow stakefish
    /// to collect commission on the priority and MEV tips.
    function withdraw() external override nonReentrant isNFTOwner {
        uint256 availableBalance = address(this).balance;

        if (withdrawnBalance >= 32 ether) {
            // all balance need to pay stakefish commission
            uint256 commission = (availableBalance * getProtocolFee()) / 10000;
            uint256 userReward = availableBalance - commission;
            withdrawnBalance += availableBalance;
            Address.sendValue(payable(StorageSlot.getAddressSlot(_FACTORY_SLOT).value), commission);
            Address.sendValue(payable(getNFTOwner()), userReward);
            emit StakefishValidatorWithdrawn(pubkey, userReward);
            emit StakefishValidatorCommissionTransferred(pubkey, commission);
        } else {
            if (withdrawnBalance + availableBalance <= 32 ether) {
                // all balance can be withdrawn commission free
                withdrawnBalance += availableBalance;
                Address.sendValue(payable(getNFTOwner()), availableBalance);
                emit StakefishValidatorWithdrawn(pubkey, availableBalance);
            } else {
                // a part of the balance can be withdrawn commission free
                uint256 commissionApplyBalance = availableBalance + withdrawnBalance - 32 ether;
                uint256 commission = (commissionApplyBalance * getProtocolFee()) / 10000;
                uint256 userReward = availableBalance - commission;
                withdrawnBalance += availableBalance;
                Address.sendValue(payable(StorageSlot.getAddressSlot(_FACTORY_SLOT).value), commission);
                Address.sendValue(payable(getNFTOwner()), userReward);
                emit StakefishValidatorWithdrawn(pubkey, userReward);
                emit StakefishValidatorCommissionTransferred(pubkey, commission);
            }
        }

        if(this.lastStateChange().state == State.PreDeposit) {
            stateHistory.push(StateChange(State.Burnable, 0x0, uint128(block.timestamp)));
        }
    }

    function validatorFeePoolChange(address _feePoolAddress) external nonReentrant override operatorOnly {
        feePoolAddress = _feePoolAddress;
        emit StakefishValidatorFeePoolChanged(pubkey, _feePoolAddress);
    }

    function pendingFeePoolReward() external override view returns (uint256, uint256) {
        return IStakefishTransactionFeePoolV2(payable(feePoolAddress)).pendingReward(address(this));
    }

    function claimFeePool(uint256 amountRequested) external nonReentrant override isNFTMultiCallOrNFTOwner {
        IStakefishTransactionFeePoolV2(payable(feePoolAddress)).collectReward(payable(getNFTOwner()), amountRequested);
    }

    function render() external view override returns (string memory) {
        return "";
    }
}
