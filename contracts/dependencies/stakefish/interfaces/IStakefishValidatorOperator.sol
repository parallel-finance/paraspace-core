// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

interface IStakefishValidatorOperator {
    /// @notice immutable nft manager address
    function nftManager() external returns (address);

    /// @notice Multicall batch calls across validators
    /// @param tokenIds Array of tokenIds
    /// @param data Array of calldata
    function multicall(uint256[] calldata tokenIds, bytes[] calldata data) external returns (bytes[] memory results);
}
