// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IParaxL2MessageHandler {
    function updateTokenDelegation(
        address delegateTo,
        address underlyingAsset,
        uint256[] calldata tokenIds,
        bool value
    ) external;
}
