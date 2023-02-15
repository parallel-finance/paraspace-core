// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IYieldInfo {
    /**
     * @notice Returns pool's current yield index.
     **/
    function yieldIndex() external view returns (uint256);

    /**
     * @notice Returns pool's yield token address.
     **/
    function yieldToken() external view returns (address);

    /**
     * @notice Returns pool's underlying yield token address, yield token address and current yield index.
     **/
    function yieldInfo()
        external
        view
        returns (
            address,
            address,
            uint256
        );
}
