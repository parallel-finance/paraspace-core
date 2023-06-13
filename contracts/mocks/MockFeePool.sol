// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {Helpers} from "../protocol/libraries/helpers/Helpers.sol";

contract MockFeePool {
  constructor() {
  }

  function collectReward(address user, uint256 amount) external  {
    Helpers.safeTransferETH(user, amount);
  }

  receive() external payable {}
}
