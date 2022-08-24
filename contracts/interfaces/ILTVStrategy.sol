// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

interface ILTVStrategy {
    function getLTV(uint256 data) external view returns (uint256);
}
