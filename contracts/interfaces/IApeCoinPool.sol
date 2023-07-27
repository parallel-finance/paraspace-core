// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

interface IApeCoinPool {
    struct ApeCoinDepositInfo {
        address onBehalf;
        address cashToken;
        uint256 cashAmount;
        bool isBAYC;
        uint32[] tokenIds;
    }

    struct ApeCoinPairDepositInfo {
        address onBehalf;
        address cashToken;
        uint256 cashAmount;
        bool isBAYC;
        uint32[] apeTokenIds;
        uint32[] bakcTokenIds;
    }

    struct ApeCoinWithdrawInfo {
        address cashToken;
        uint256 cashAmount;
        bool isBAYC;
        uint32[] tokenIds;
    }

    struct ApeCoinPairWithdrawInfo {
        address cashToken;
        uint256 cashAmount;
        bool isBAYC;
        uint32[] apeTokenIds;
        uint32[] bakcTokenIds;
    }

    function depositApeCoinPool(ApeCoinDepositInfo calldata depositInfo)
        external;

    function compoundApeCoinPool(bool isBAYC, uint32[] calldata tokenIds)
        external;

    function apeCoinPoolPendingReward(bool isBAYC, uint32[] calldata tokenIds)
        external
        view
        returns (uint256);

    function claimApeCoinPool(bool isBAYC, uint32[] calldata tokenIds) external;

    function withdrawApeCoinPool(ApeCoinWithdrawInfo calldata withdrawInfo)
        external;

    function depositApeCoinPairPool(ApeCoinPairDepositInfo calldata depositInfo)
        external;

    function compoundApeCoinPairPool(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external;

    function apeCoinPairPoolPendingReward(
        bool isBAYC,
        uint32[] calldata apeTokenIds
    ) external view returns (uint256);

    function claimApeCoinPairPool(bool isBAYC, uint32[] calldata apeTokenIds)
        external;

    function withdrawApeCoinPairPool(
        ApeCoinPairWithdrawInfo calldata withdrawInfo
    ) external;

    function tryUnstakeApeCoinPoolPosition(
        bool isBAYC,
        uint256[] calldata tokenIds
    ) external;
}
