// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import "./AirdropFlashClaimReceiver.sol";
import "../interfaces/IUserFlashclaimRegistry.sol";
import "../../dependencies/openzeppelin/upgradeability/Clones.sol";
import "../../dependencies/openzeppelin/upgradeability/Initializable.sol";

contract UserFlashclaimRegistry is Initializable, IUserFlashclaimRegistry {
    address public immutable pool;

    mapping(address => address) public userReceivers;
    address public receiverImplementation;

    constructor(address pool_) {
        pool = pool_;
    }

    function initialize(address receiverImplementation_) public initializer {
        receiverImplementation = receiverImplementation_;
    }

    /**
     * @notice create a default receiver contract for the user
     */
    function createReceiver() public virtual override {
        address caller = msg.sender;
        address receiverAddress = Clones.clone(receiverImplementation);

        AirdropFlashClaimReceiver(receiverAddress).initialize(msg.sender);

        userReceivers[caller] = receiverAddress;
    }

    /**
     * @notice get receiver contract address for the user
     * @param user The user address
     */
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
