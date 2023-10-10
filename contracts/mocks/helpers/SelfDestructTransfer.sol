// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {Helpers} from "../../protocol/libraries/helpers/Helpers.sol";

contract SelfdestructTransfer {
    function destroyAndTransfer(address payable to) external payable {
      revert("selfdestruct is deprecated");
    }
}
