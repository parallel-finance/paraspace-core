// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import {AccountProxy} from "./AccountProxy.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract AccountFactory {
    address immutable accountProxyImplementation;

    constructor(address accountProxyImplementation_) {
        accountProxyImplementation = accountProxyImplementation_;
    }

    /**
     * @notice create a default account contract for the user
     */
    function createAccount() external returns (AccountProxy proxyAddress) {
        proxyAddress = new AccountProxy(accountProxyImplementation);

        proxyAddress.initialize();
    }
}
