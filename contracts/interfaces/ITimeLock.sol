pragma solidity ^0.8.10;

import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

interface ITimeLock {
    struct Agreement {
        DataTypes.AssetType assetType;
        DataTypes.TimeLockActionType actionType;
        bool isFrozen;
        address asset;
        address beneficiary;
        uint48 releaseTime;
        uint256[] tokenIdsOrAmounts;
    }

    function createAgreement(
        DataTypes.AssetType assetType,
        DataTypes.TimeLockActionType actionType,
        address asset,
        uint256[] memory tokenIdsOrAmounts,
        address beneficiary,
        uint48 releaseTime
    ) external returns (uint256);

    function claim(uint256[] calldata agreementIds) external;

    function freezeAgreement(uint256 agreementId, bool freeze) external;
}
