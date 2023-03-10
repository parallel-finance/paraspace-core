// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

/**
 * @title IInstantWithdrawNFT
 *
 * @notice Defines the basic interface for an InstantWithdrawNFT contract.
 **/
interface IInstantWithdrawNFT {
    function burn(uint256 tokenId, uint256 amount) external;
}
