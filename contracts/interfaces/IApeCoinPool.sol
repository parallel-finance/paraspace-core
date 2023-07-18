// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

interface IApeCoinPool {
    struct TokenStatus {
        //record tokenId reward debt position
        uint128 rewardsDebt;
        // identify if tokenId is in pool
        bool isInPool;
    }

    struct ApeCoinPoolState {
        // total NFT position count
        uint32 totalPosition;
        // accumulated cApe reward for per NFT position
        uint128 accumulatedRewardsPerNft;
        //tokenId => reward debt position
        mapping(uint256 => TokenStatus) tokenStatus;
    }
}
