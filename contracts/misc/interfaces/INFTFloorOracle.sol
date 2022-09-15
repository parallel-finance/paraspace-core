// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

interface INFTFloorOracle {
    function getTwap(address token) external view returns (uint128 price);

    function getLastUpdateTime(address token)
        external
        view
        returns (uint128 timestamp);
}
