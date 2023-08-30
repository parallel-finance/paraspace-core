// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

contract AccountRegistry {
    address immutable accountImplementation;

    constructor(address _accountImplementation) {
        accountImplementation = _accountImplementation;
    }

    function getLatestImplementation() external view returns (address) {
        return accountImplementation;
    }
}
