
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import {AccountProxy} from "./AccountProxy.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract AccountFactyory {

    address public immutable accountProxyImplementation;

    constructor(address accountProxyImplementation_) {
        accountProxyImplementation = accountProxyImplementation_;
    }

    /**
     * @notice create a default receiver contract for the user
     */
    function createAccount() external returns(address proxyAddress) {
        address payable proxyAddress = payable(Clones.clone(accountProxyImplementation));

        AccountProxy(proxyAddress).initialize();
    }
}