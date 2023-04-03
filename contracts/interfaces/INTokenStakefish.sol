// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

interface INTokenStakefish {
    // @param user The owner of validator NFT
    // @param tokenIds The list of token ID of validator NFT
    // @param to The recipient of withdrawn ETH
    //
    // @notice allows the users to
    // withdraw their funds corresponding to the validator represented by tokenId.
    function withdraw(
        address user,
        uint256[] calldata tokenIds,
        address to
    ) external;

    // @param tokenId The token ID of validator NFT
    //
    // @notice allows validator to request withdrawal from the staking pool
    function requestExit(uint256[] calldata tokenIds) external;

    // @param tokenId The token ID of validator NFT
    //
    // @notice Get the pending fee pool reward for the validator represented by tokenId.
    function pendingFeePoolReward(uint256 tokenId)
        external
        view
        returns (uint256, uint256);
}
