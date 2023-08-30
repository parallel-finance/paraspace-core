// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

contract AccountStorage {
    struct AccountConfiguration {
        bool isDelegated;
        address owner;
    }

    bytes32 constant ACCOUNT_STORAGE_POSITION =
        bytes32(uint256(keccak256("parax.account.storage")) - 1);

    function getStorage()
        internal
        pure
        returns (AccountConfiguration storage ds)
    {
        bytes32 position = ACCOUNT_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }
}
