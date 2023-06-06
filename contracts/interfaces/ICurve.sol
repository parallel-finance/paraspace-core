// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.17;

interface ICurve {
    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);
}
