// SPDX-License-Identifier: MIT
pragma solidity >0.5.0 <0.9.0;

interface IDepositContract {
    function deposit(
        bytes calldata pubkey,
        bytes calldata withdrawal_credentials,
        bytes calldata signature,
        bytes32 deposit_data_root
    ) external payable;
}