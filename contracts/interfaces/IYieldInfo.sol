// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IYieldInfo {
    /**
     * @notice Returns pool's settled yield index and latest yield index.
     **/
    function yieldIndex() external view returns (uint256, uint256);

    /**
     * @notice Returns pool's underlying yield token and yield token address.
     **/
    function yieldToken() external view returns (address, address);
}
