// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

interface ILido {
    function getPooledEthByShares(uint256 _sharesAmount)
        external
        view
        returns (uint256);
}
