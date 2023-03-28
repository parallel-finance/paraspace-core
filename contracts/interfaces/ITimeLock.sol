// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.10;

import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

/** @title ITimeLock interface for the TimeLock smart contract */
interface ITimeLock {
    enum AgreementStatus {
        NoExist,
        Active,
        Frozen
    }

    /** @dev Struct representing a time-lock agreement
     * @param assetType Type of the asset involved
     * @param actionType Type of action for the time-lock
     * @param asset Address of the asset
     * @param beneficiary Address of the beneficiary
     * @param releaseTime Timestamp when the assets can be claimed
     * @param tokenIdsOrAmounts Array of token IDs or amounts
     */
    struct Agreement {
        DataTypes.AssetType assetType;
        DataTypes.TimeLockActionType actionType;
        address asset;
        address beneficiary;
        uint48 releaseTime;
        uint256[] tokenIdsOrAmounts;
    }

    /** @notice Event emitted when a new time-lock agreement is created
     * @param agreementId ID of the created agreement
     * @param assetType Type of the asset involved
     * @param actionType Type of action for the time-lock
     * @param asset Address of the asset
     * @param tokenIdsOrAmounts Array of token IDs or amounts
     * @param beneficiary Address of the beneficiary
     * @param releaseTime Timestamp when the assets can be claimed
     */
    event AgreementCreated(
        bytes32 agreementId,
        DataTypes.AssetType assetType,
        DataTypes.TimeLockActionType actionType,
        address indexed asset,
        uint256[] tokenIdsOrAmounts,
        address indexed beneficiary,
        uint48 releaseTime
    );

    /** @notice Event emitted when a time-lock agreement is claimed
     * @param agreementId ID of the claimed agreement
     * @param assetType Type of the asset involved
     * @param actionType Type of action for the time-lock
     * @param asset Address of the asset
     * @param tokenIdsOrAmounts Array of token IDs or amounts
     * @param beneficiary Address of the beneficiary
     */
    event AgreementClaimed(
        bytes32 agreementId,
        DataTypes.AssetType assetType,
        DataTypes.TimeLockActionType actionType,
        address indexed asset,
        uint256[] tokenIdsOrAmounts,
        address indexed beneficiary
    );

    /** @notice Event emitted when a time-lock agreement is frozen or unfrozen
     * @param agreementId ID of the affected agreement
     * @param value Indicates whether the agreement is frozen (true) or unfrozen (false)
     */
    event AgreementFrozen(bytes32 agreementId, bool value);

    /** @notice Event emitted when the entire TimeLock contract is frozen or unfrozen
     * @param value Indicates whether the contract is frozen (true) or unfrozen (false)
     */
    event TimeLockFrozen(bool value);

    /** @dev Function to create a new time-lock agreement
     * @param assetType Type of the asset involved
     * @param actionType Type of action for the time-lock
     * @param asset Address of the asset
     * @param tokenIdsOrAmounts Array of token IDs or amounts
     * @param beneficiary Address of the beneficiary
     * @param releaseTime Timestamp when the assets can be claimed
     * @return Returns the created agreement
     */
    function createAgreement(
        DataTypes.AssetType assetType,
        DataTypes.TimeLockActionType actionType,
        address asset,
        uint256[] memory tokenIdsOrAmounts,
        address beneficiary,
        uint48 releaseTime
    ) external returns (Agreement memory);

    /** @dev Function to claim assets from time-lock agreements
     * @param agreements Array of agreements to be claimed
     */
    function claim(Agreement[] calldata agreements) external;

    /** @dev Function to freeze a specific time-lock agreement
     * @param agreementId ID of the agreement to be frozen
     */
    function freezeAgreement(bytes32 agreementId) external;

    /** @dev Function to unfreeze a specific time-lock agreement
     * @param agreementId ID of the agreement to be unfrozen
     */
    function unfreezeAgreement(bytes32 agreementId) external;

    /** @dev Function to freeze all time-lock agreements
     * @notice This function can only be called by an authorized user
     */
    function freezeAllAgreements() external;

    /** @dev Function to unfreeze all time-lock agreements
     * @notice This function can only be called by an authorized user
     */
    function unfreezeAllAgreements() external;
}
