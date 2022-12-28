// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;


library Helpers {
    function unchecked_inc(uint i) internal pure returns (uint) {
        unchecked {
            return i + 1;
        }
    }
}