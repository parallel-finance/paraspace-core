// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./common/Constants.sol";
import "./interfaces/IVersion.sol";

abstract contract Version is IVersion {
    function getVersion() external pure returns (uint64) {
        return VERSION;
    }
}
