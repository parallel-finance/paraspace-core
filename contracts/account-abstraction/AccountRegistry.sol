// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import {Ownable} from "../dependencies/openzeppelin/contracts/Ownable.sol";
import {Errors} from "../protocol/libraries/helpers/Errors.sol";

contract AccountRegistry is Ownable {
    event AccountImplementationUpdated(
        address oldImplementation,
        address newImplementation
    );

    address internal accountImplementation;

    constructor(address _accountImplementation) {
        _setLatestImplementation(_accountImplementation);
    }

    function setLatestImplementation(
        address _implementation
    ) external onlyOwner {
        _setLatestImplementation(_implementation);
    }

    function getLatestImplementation() external view returns (address) {
        return accountImplementation;
    }

    function _setLatestImplementation(address _implementation) internal {
        require(_implementation != address(0), Errors.INVALID_PARAMETER);
        address oldImplementation = accountImplementation;
        if (oldImplementation != _implementation) {
            accountImplementation = _implementation;
            emit AccountImplementationUpdated(
                oldImplementation,
                _implementation
            );
        }
    }
}
