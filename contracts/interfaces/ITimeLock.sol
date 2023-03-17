pragma solidity ^0.8.0;

interface ITimeLock {
    struct Agreement {
        address lockedAsset;
        uint256[] tokenIds;
        uint256[] tokenAmounts;
        address beneficiary;
        uint256 releaseTime;
        bool frozen;
    }

    function submitAgreement(
        address lockedAsset,
        uint256[] memory tokenIds,
        uint256[] memory tokenAmounts,
        address beneficiary,
        uint256 releaseTime
    ) external returns (uint256);

    function claim(uint256 agreementId) external;

    function freezeAgreement(uint256 agreementId, bool freeze) external;
}
