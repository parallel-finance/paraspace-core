// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IYieldInfo {
    function yieldIndex() external view returns (uint256);

    function yieldToken() external view returns (address);

    function yieldInfo()
        external
        view
        returns (
            address,
            address,
            uint256
        );
}
