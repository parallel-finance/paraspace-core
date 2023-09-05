// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.10;

interface IAccountFactory {
    function createAccount(
        address owner,
        uint256 salt
    ) external returns (address);
}
