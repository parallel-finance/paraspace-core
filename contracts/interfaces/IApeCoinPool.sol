// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

interface IApeCoinPool {
    function tryUnstakeApeCoinPoolPosition(
        bool isBAYC,
        uint256[] calldata tokenIds
    ) external;
}
