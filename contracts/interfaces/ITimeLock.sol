// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

/** @title ITimeLock interface for the TimeLock smart contract */
interface ITimeLock {
    /** @dev Struct representing a time-lock agreement
     * @param assetType Type of the asset involved
     * @param actionType Type of action for the time-lock
     * @param isFrozen Indicates if the agreement is frozen
     * @param asset Address of the asset
     * @param beneficiary Address of the beneficiary
     * @param releaseTime Timestamp when the assets can be claimed
     * @param tokenIdsOrAmounts Array of token IDs or amounts
     */
    struct Agreement {
        DataTypes.AssetType assetType;
        DataTypes.TimeLockActionType actionType;
        bool isFrozen;
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
        uint256 agreementId,
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
        uint256 agreementId,
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
    event AgreementFrozen(uint256 agreementId, bool value);

    /** @notice Event emitted when the entire TimeLock contract is frozen or unfrozen
     * @param value Indicates whether the contract is frozen (true) or unfrozen (false)
     */
    event TimeLockFrozen(bool value);

    /**
     * @notice TimeLockWhiteListEvents
     * @dev This event is emitted when the time lock whitelist is updated. It provides information about
     * addresses that were added to and removed from the whitelist during the update.
     *
     * @param added An array of addresses that were added to the time lock whitelist.
     * @param removed An array of addresses that were removed from the time lock whitelist.
     */
    event TimeLockWhitelistUpdated(address[] added, address[] removed);

    /** @dev Function to create a new time-lock agreement
     * @param assetType Type of the asset involved
     * @param actionType Type of action for the time-lock
     * @param asset Address of the asset
     * @param tokenIdsOrAmounts Array of token IDs or amounts
     * @param beneficiary Address of the beneficiary
     * @param releaseTime Timestamp when the assets can be claimed
     * @return agreementId Returns the ID of the created agreement
     */
    function createAgreement(
        DataTypes.AssetType assetType,
        DataTypes.TimeLockActionType actionType,
        address asset,
        uint256[] memory tokenIdsOrAmounts,
        address beneficiary,
        uint48 releaseTime
    ) external returns (uint256 agreementId);

    /** @dev Function to claim assets from time-lock agreements
     * @param agreementIds Array of agreement IDs to be claimed
     */
    function claim(uint256[] calldata agreementIds) external;

    /** @dev Function to claim MoonBird from time-lock agreements
     * @param agreementIds Array of agreement IDs to be claimed
     */
    function claimMoonBirds(uint256[] calldata agreementIds) external;

    /** @dev Function to freeze a specific time-lock agreement
     * @param agreementId ID of the agreement to be frozen
     */
    function freezeAgreement(uint256 agreementId) external;

    /** @dev Function to unfreeze a specific time-lock agreement
     * @param agreementId ID of the agreement to be unfrozen
     */
    function unfreezeAgreement(uint256 agreementId) external;

    /** @dev Function to freeze all time-lock agreements
     * @notice This function can only be called by an authorized user
     */
    function freezeAllAgreements() external;

    /** @dev Function to unfreeze all time-lock agreements
     * @notice This function can only be called by an authorized user
     */
    function unfreezeAllAgreements() external;

    /**
     * @dev Updates the time lock whitelist by adding and/or removing multiple addresses.
     * @param toAdd An array of addresses to be added to the whitelist.
     * @param toRemove An array of addresses to be removed from the whitelist.
     */
    function updateTimeLockWhiteList(
        address[] calldata toAdd,
        address[] calldata toRemove
    ) external;

    /**
     * @notice TimeLockWhiteList
     * @dev This function allows external callers to check whether an array of addresses are
     * on the time lock whitelist, indicating whether they have permission for specific actions.
     *
     * @param users An array of addresses to check for whitelist membership.
     * @return isWhiteListed An array of boolean values indicating whether each provided address
     * is on the time lock whitelist (true if whitelisted, false otherwise).
     */
    function isTimeLockWhiteListed(
        address[] calldata users
    ) external view returns (bool[] memory);
}
