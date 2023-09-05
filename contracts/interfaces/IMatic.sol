// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {IERC20Detailed} from "../dependencies/openzeppelin/contracts/IERC20Detailed.sol";

interface IMatic is IERC20Detailed {
    function convertStMaticToMatic(
        uint256 _sharesAmount
    ) external view returns (uint256);

    function convertMaticToStMatic(
        uint256 _pooledEth
    ) external view returns (uint256);
}
