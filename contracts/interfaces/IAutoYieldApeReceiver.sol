// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

/**
 * @title SApe receiver interface
 */
interface IAutoYieldApeReceiver {
    function onAutoYieldApeReceived(address operator, address from)
        external
        returns (bytes4);
}
