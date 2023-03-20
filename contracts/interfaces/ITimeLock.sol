pragma solidity ^0.8.10;

import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

interface ITimeLock {
    function createAgreement(
        DataTypes.AssetType assetType,
        address token,
        uint256[] memory tokenIdsOrAmounts,
        address beneficiary,
        uint256 releaseTime
    ) external returns (uint256);

    function claim(uint256 agreementId) external;

    function freezeAgreement(uint256 agreementId, bool freeze) external;
}
