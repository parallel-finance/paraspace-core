// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

interface ISafe {
    function addOwnerWithThreshold(address owner, uint256 _threshold) external;

    function removeOwner(
        address prevOwner,
        address owner,
        uint256 _threshold
    ) external;

    function swapOwner(
        address prevOwner,
        address oldOwner,
        address newOwner
    ) external;
}
