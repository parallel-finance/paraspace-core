// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import "./AirdropFlashClaimReceiver.sol";
import "../interfaces/IUserFlashclaimRegistry.sol";

contract UserFlashclaimRegistry is IUserFlashclaimRegistry {
    address public pool;
    mapping(address => address) public userReceivers;

    constructor(address pool_) {
        pool = pool_;
    }

    function createReceiver() public virtual override {
        address caller = msg.sender;
        AirdropFlashClaimReceiver receiver = new AirdropFlashClaimReceiver(
            caller,
            pool
        );
        userReceivers[caller] = address(receiver);
    }

    function getUserReceivers(address user)
        external
        view
        virtual
        override
        returns (address)
    {
        return userReceivers[user];
    }
}
