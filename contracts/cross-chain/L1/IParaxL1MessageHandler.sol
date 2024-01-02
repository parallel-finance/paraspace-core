// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IParaxL1MessageHandler {
    function migration(address asset) external;

    function updateTokenDelegation(
        address delegateTo,
        address underlyingAsset,
        uint256[] calldata tokenIds,
        bool value
    ) external;

    function updateApeStakingBeneficiary(
        address nft,
        uint32[] calldata tokenIds,
        address newBenificiary
    ) external;
}
