// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

interface IRebasingPToken {
    function lastRebasingIndex() external view returns (uint256);
}
