// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

interface IUserFlashclaimRegistry {
    function createReceiver() external;

    function getUserReceivers(address user) external view returns (address);
}
