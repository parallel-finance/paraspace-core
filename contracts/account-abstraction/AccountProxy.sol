// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./AccountRegistry.sol";

contract AccountProxy is ERC1967Proxy {
    AccountRegistry immutable accountRegistry;

    /**
     * @dev Initializes the upgradeable proxy with an initial implementation specified by `_logic`.
     *
     * If `_data` is nonempty, it's used as data in a delegate call to `_logic`. This will typically be an encoded
     * function call, and allows initializing the storage of the proxy like a Solidity constructor.
     */
    constructor(
        AccountRegistry _accountRegistry,
        bytes memory _data
    ) ERC1967Proxy(_accountRegistry.getLatestImplementation(), _data) {
        accountRegistry = _accountRegistry;
    }

    /**
     * @dev Returns the current implementation address.
     */
    function _implementation()
        internal
        view
        virtual
        override
        returns (address impl)
    {
        impl = accountRegistry.getLatestImplementation();
    }

    function getImplementation() external view returns (address impl) {
        return _implementation();
    }
}
