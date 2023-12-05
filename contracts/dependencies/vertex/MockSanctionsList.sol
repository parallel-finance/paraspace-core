// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

contract MockSanctionsList {
    function isSanctioned(
        address /* addr */
    ) external pure returns (bool) {
        return false;
    }
}
