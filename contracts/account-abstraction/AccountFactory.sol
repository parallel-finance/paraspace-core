// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import "./Account.sol";
import {BeaconProxy} from "./../dependencies/openzeppelin/upgradeability/BeaconProxy.sol";
import {UpgradeableBeacon} from "./../dependencies/openzeppelin/upgradeability/UpgradeableBeacon.sol";

/**
 * A factory contract for SimpleAccount
 * A UserOperations "initCode" holds the address of the factory, and a method call (to createAccount, in this sample factory).
 * The factory's createAccount returns the target account address even if it is already installed.
 * This way, the entryPoint.getSenderAddress() can be called either before or after the account is created.
 */
contract AccountFactory {
    UpgradeableBeacon public immutable beacon;

    event AccountCreated(
        address indexed owner,
        uint256 salt,
        address accountAddress
    );

    constructor(UpgradeableBeacon _beacon) {
        beacon = _beacon;
    }

    /**
     * create an account, and return its address.
     * returns the address even if the account is already deployed.
     * Note that during UserOperation execution, this method is called only if the account is not deployed.
     * This method returns an existing account address so that entryPoint.getSenderAddress() would work even after account creation
     */
    function createAccount(
        address owner,
        uint256 salt
    ) public returns (Account ret) {
        require(
            beacon.implementation() != address(0),
            "Implementation Not Set"
        );

        address addr = getAddress(owner, salt);
        uint256 codeSize = addr.code.length;
        if (codeSize > 0) {
            return Account(payable(addr));
        }
        ret = Account(
            payable(
                new BeaconProxy{salt: bytes32(salt)}(
                    address(beacon),
                    abi.encodeCall(Account.initialize, (owner))
                )
            )
        );

        emit AccountCreated(owner, salt, address(ret));
    }

    /**
     * calculate the counterfactual address of this account as it would be returned by createAccount()
     */
    function getAddress(
        address owner,
        uint256 salt
    ) public view returns (address) {
        return
            Create2.computeAddress(
                bytes32(salt),
                keccak256(
                    abi.encodePacked(
                        type(BeaconProxy).creationCode,
                        abi.encode(
                            address(beacon),
                            abi.encodeCall(Account.initialize, (owner))
                        )
                    )
                )
            );
    }
}
