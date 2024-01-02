// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IVaultParaX {
    function updateTokenDelegation(
        address delegateTo,
        address asset,
        uint256[] calldata tokenIds,
        bool value
    ) external;
}
