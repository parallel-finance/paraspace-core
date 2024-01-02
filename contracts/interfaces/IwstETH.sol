// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {IERC20Detailed} from "../dependencies/openzeppelin/contracts/IERC20Detailed.sol";

interface IwstETH is IERC20Detailed {
    function stETH() external view returns (address);

    function stEthPerToken() external view returns (uint256);
}
