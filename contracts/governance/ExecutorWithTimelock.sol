// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;
pragma abicoder v2;

import {IExecutorWithTimelock} from "../interfaces/IExecutorWithTimelock.sol";
import {IACLManager} from "../interfaces/IACLManager.sol";
import {SafeMath} from "../dependencies/openzeppelin/contracts/SafeMath.sol";
import {Errors} from "../protocol/libraries/helpers/Errors.sol";

/**
 * @title Time Locked Executor Contract
 * @dev Contract that can queue, execute, cancel transactions voted by Governance
 * Queued transactions can be executed after a delay and until
 * Grace period is not over.
 **/
contract ExecutorWithTimelock is IExecutorWithTimelock {
    using SafeMath for uint256;
    enum TransactionStatus {
        Default,
        Queued,
        Approved,
        Cancelled,
        Executed
    }

    IACLManager private immutable aclManager;
    uint256 public immutable override GRACE_PERIOD;
    uint256 public immutable override MINIMUM_DELAY;
    uint256 public immutable override MAXIMUM_DELAY;

    uint256 private _delay;

    // Map of actionHash to status
    mapping(bytes32 => TransactionStatus) public transactionStatus;

    // Map of contract selector need to be approved (contract address => selector => needApprove)
    mapping(address => mapping(bytes4 => bool)) private needApprovalFilter;

    /**
     * @dev Constructor
     * @param delay minimum time between queueing and execution of proposal
     * @param gracePeriod time after `delay` while a proposal can be executed
     * @param minimumDelay lower threshold of `delay`, in seconds
     * @param maximumDelay upper threshold of `delay`, in seconds
     **/
    constructor(
        address _aclManager,
        uint256 delay,
        uint256 gracePeriod,
        uint256 minimumDelay,
        uint256 maximumDelay
    ) {
        aclManager = IACLManager(_aclManager);
        require(delay >= minimumDelay, "DELAY_SHORTER_THAN_MINIMUM");
        require(delay <= maximumDelay, "DELAY_LONGER_THAN_MAXIMUM");
        _delay = delay;

        GRACE_PERIOD = gracePeriod;
        MINIMUM_DELAY = minimumDelay;
        MAXIMUM_DELAY = maximumDelay;

        emit NewDelay(delay);
    }

    /**
     * @dev Only propose admin can call functions marked by this modifier.
     **/
    modifier onlyProposeAdmin() {
        _onlyProposeAdmin();
        _;
    }

    /**
     * @dev Only approve admin can call functions marked by this modifier.
     **/
    modifier onlyApproveAdmin() {
        _onlyApproveAdmin();
        _;
    }

    /**
     * @dev Only propose admin can call functions marked by this modifier.
     **/
    modifier onlyProposeOrApproveAdmin() {
        _onlyProposeOrApproveAdmin();
        _;
    }

    function _onlyProposeAdmin() internal view {
        require(
            aclManager.isActionProposeAdmin(msg.sender),
            Errors.CALLER_NOT_ACTION_PROPOSE_ADMIN
        );
    }

    function _onlyApproveAdmin() internal view {
        require(
            aclManager.isActionApproveAdmin(msg.sender),
            Errors.CALLER_NOT_ACTION_APPROVE_ADMIN
        );
    }

    function _onlyProposeOrApproveAdmin() internal view {
        require(
            aclManager.isActionProposeAdmin(msg.sender) ||
                aclManager.isActionApproveAdmin(msg.sender),
            Errors.CALLER_NOT_ACTION_PROPOSE_OR_APPROVE_ADMIN
        );
    }

    modifier onlyTimelock() {
        require(msg.sender == address(this), "ONLY_BY_THIS_TIMELOCK");
        _;
    }

    /**
     * @dev Set if an action need approval
     * @param targets the contract addresses for the action
     * @param selectors the function selectors for the action
     * @param needApprovals identify if action need approval
     **/
    function setActionNeedApproval(
        address[] calldata targets,
        bytes4[][] calldata selectors,
        bool[][] calldata needApprovals
    ) external onlyApproveAdmin {
        uint256 targetLength = targets.length;
        require(
            selectors.length == targetLength &&
                needApprovals.length == targetLength,
            "invalid params"
        );
        for (uint256 index = 0; index < targetLength; index++) {
            address target = targets[index];
            bytes4[] calldata targetSelectors = selectors[index];
            bool[] calldata targetApprovals = needApprovals[index];
            uint256 selectorLength = targetSelectors.length;
            require(selectorLength == targetApprovals.length, "invalid params");
            for (
                uint256 selectorIndex = 0;
                selectorIndex < selectorLength;
                selectorIndex++
            ) {
                bytes4 selector = targetSelectors[selectorIndex];
                bool needApproval = targetApprovals[selectorIndex];
                bool currentStatus = needApprovalFilter[target][selector];
                if (currentStatus != needApproval) {
                    needApprovalFilter[target][selector] = needApproval;
                    emit UpdateActionApproveFilter(
                        target,
                        selector,
                        needApproval
                    );
                }
            }
        }
    }

    /**
     * @dev Set the delay
     * @param delay delay between queue and execution of proposal
     **/
    function setDelay(uint256 delay) public onlyTimelock {
        _validateDelay(delay);
        _delay = delay;

        emit NewDelay(delay);
    }

    /**
     * @dev Function, called by Governance, that queue a transaction, returns action hash
     * @param target smart contract target
     * @param value wei value of the transaction
     * @param signature function signature of the transaction
     * @param data function arguments of the transaction or callData if signature empty
     * @param executionTime time at which to execute the transaction
     * @param withDelegatecall boolean, true = transaction delegatecalls the target, else calls the target
     * @return the action Hash
     **/
    function queueTransaction(
        address target,
        uint256 value,
        string memory signature,
        bytes memory data,
        uint256 executionTime,
        bool withDelegatecall
    ) public override onlyProposeAdmin returns (bytes32) {
        require(
            executionTime >= block.timestamp.add(_delay),
            "EXECUTION_TIME_UNDERESTIMATED"
        );

        bytes32 actionHash = keccak256(
            abi.encode(
                target,
                value,
                signature,
                data,
                executionTime,
                withDelegatecall
            )
        );
        require(
            transactionStatus[actionHash] == TransactionStatus.Default,
            "WRONG_ACTION_STATUS "
        );
        transactionStatus[actionHash] = TransactionStatus.Queued;

        emit QueuedAction(
            actionHash,
            target,
            value,
            signature,
            data,
            executionTime,
            withDelegatecall
        );
        return actionHash;
    }

    /**
     * @dev Function, called by Governance, that approve a transaction, returns action hash
     * @param target smart contract target
     * @param value wei value of the transaction
     * @param signature function signature of the transaction
     * @param data function arguments of the transaction or callData if signature empty
     * @param executionTime time at which to execute the transaction
     * @param withDelegatecall boolean, true = transaction delegatecalls the target, else calls the target
     * @return the action Hash
     **/
    function approveTransaction(
        address target,
        uint256 value,
        string memory signature,
        bytes memory data,
        uint256 executionTime,
        bool withDelegatecall
    ) public override onlyApproveAdmin returns (bytes32) {
        bytes32 actionHash = keccak256(
            abi.encode(
                target,
                value,
                signature,
                data,
                executionTime,
                withDelegatecall
            )
        );

        require(
            transactionStatus[actionHash] == TransactionStatus.Queued,
            "ACTION_NOT_QUEUED"
        );
        bytes4 selector;
        if (bytes(signature).length == 0) {
            selector = bytes4(data);
        } else {
            selector = bytes4(keccak256(bytes(signature)));
        }
        bool isNeedApproval = needApprovalFilter[target][selector];
        require(isNeedApproval, "ACTION_NOT_NEED_APPROVAL");
        require(
            block.timestamp <= executionTime.add(GRACE_PERIOD),
            "GRACE_PERIOD_FINISHED"
        );

        transactionStatus[actionHash] = TransactionStatus.Approved;

        emit ApprovedAction(
            actionHash,
            target,
            value,
            signature,
            data,
            executionTime,
            withDelegatecall
        );
        return actionHash;
    }

    /**
     * @dev Function, called by Governance, that cancels a transaction, returns action hash
     * @param target smart contract target
     * @param value wei value of the transaction
     * @param signature function signature of the transaction
     * @param data function arguments of the transaction or callData if signature empty
     * @param executionTime time at which to execute the transaction
     * @param withDelegatecall boolean, true = transaction delegatecalls the target, else calls the target
     * @return the action Hash of the canceled tx
     **/
    function cancelTransaction(
        address target,
        uint256 value,
        string memory signature,
        bytes memory data,
        uint256 executionTime,
        bool withDelegatecall
    ) public override onlyProposeOrApproveAdmin returns (bytes32) {
        bytes32 actionHash = keccak256(
            abi.encode(
                target,
                value,
                signature,
                data,
                executionTime,
                withDelegatecall
            )
        );
        TransactionStatus status = transactionStatus[actionHash];
        require(
            status == TransactionStatus.Queued ||
                status == TransactionStatus.Approved,
            "WRONG_ACTION_STATUS "
        );
        transactionStatus[actionHash] = TransactionStatus.Cancelled;

        emit CancelledAction(
            actionHash,
            target,
            value,
            signature,
            data,
            executionTime,
            withDelegatecall
        );
        return actionHash;
    }

    /**
     * @dev Function, called by Governance, that cancels a transaction, returns the callData executed
     * @param target smart contract target
     * @param value wei value of the transaction
     * @param signature function signature of the transaction
     * @param data function arguments of the transaction or callData if signature empty
     * @param executionTime time at which to execute the transaction
     * @param withDelegatecall boolean, true = transaction delegatecalls the target, else calls the target
     * @return the callData executed as memory bytes
     **/
    function executeTransaction(
        address target,
        uint256 value,
        string memory signature,
        bytes memory data,
        uint256 executionTime,
        bool withDelegatecall
    ) public payable override onlyProposeAdmin returns (bytes memory) {
        bytes32 actionHash = keccak256(
            abi.encode(
                target,
                value,
                signature,
                data,
                executionTime,
                withDelegatecall
            )
        );
        require(block.timestamp >= executionTime, "TIMELOCK_NOT_FINISHED");
        require(
            block.timestamp <= executionTime.add(GRACE_PERIOD),
            "GRACE_PERIOD_FINISHED"
        );

        bytes4 selector;
        bytes memory callData;
        if (bytes(signature).length == 0) {
            selector = bytes4(data);
            callData = data;
        } else {
            selector = bytes4(keccak256(bytes(signature)));
            callData = abi.encodePacked(selector, data);
        }
        if (needApprovalFilter[target][selector]) {
            require(
                transactionStatus[actionHash] == TransactionStatus.Approved,
                "ACTION_NOT_APPROVED"
            );
        } else {
            require(
                transactionStatus[actionHash] == TransactionStatus.Queued,
                "ACTION_NOT_QUEUED"
            );
        }

        transactionStatus[actionHash] = TransactionStatus.Executed;

        bool success;
        bytes memory resultData;
        if (withDelegatecall) {
            require(msg.value >= value, "NOT_ENOUGH_MSG_VALUE");
            // solium-disable-next-line security/no-call-value
            (success, resultData) = target.delegatecall(callData);
        } else {
            // solium-disable-next-line security/no-call-value
            (success, resultData) = target.call{value: value}(callData);
        }

        require(success, "FAILED_ACTION_EXECUTION");

        emit ExecutedAction(
            actionHash,
            target,
            value,
            signature,
            data,
            executionTime,
            withDelegatecall,
            resultData
        );

        return resultData;
    }

    /**
     * @dev Getter of the delay between queuing and execution
     * @return The delay in seconds
     **/
    function getDelay() external view override returns (uint256) {
        return _delay;
    }

    /**
     * @dev Returns whether an action (via actionHash) is queued
     * @param actionHash hash of the action to be checked
     * keccak256(abi.encode(target, value, signature, data, executionTime, withDelegatecall))
     * @return true if underlying action of actionHash is queued
     **/
    function isActionQueued(bytes32 actionHash)
        external
        view
        override
        returns (bool)
    {
        return transactionStatus[actionHash] == TransactionStatus.Queued;
    }

    function _validateDelay(uint256 delay) internal view {
        require(delay >= MINIMUM_DELAY, "DELAY_SHORTER_THAN_MINIMUM");
        require(delay <= MAXIMUM_DELAY, "DELAY_LONGER_THAN_MAXIMUM");
    }

    receive() external payable {}
}
