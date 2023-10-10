// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

interface INFTFloorOracle {
    function getPrice(address token) external view returns (uint256 price);

    function getLastUpdateTime(
        address token
    ) external view returns (uint256 timestamp);
}
