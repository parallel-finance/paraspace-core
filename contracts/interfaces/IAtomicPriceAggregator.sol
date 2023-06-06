// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.17;

/************
@title IAtomicPriceAggregator interface
@notice Interface for individual NFT token price oracle.*/

interface IAtomicPriceAggregator {
    // get price of a specific tokenId
    function getTokenPrice(uint256 tokenId) external view returns (uint256);
}
