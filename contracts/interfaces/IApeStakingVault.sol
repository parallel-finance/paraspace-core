// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

import "../dependencies/openzeppelin/contracts/IERC20.sol";
import "../dependencies/yoga-labs/ApeCoinStaking.sol";

interface IApeStakingVault {
    struct PairingStatus {
        uint248 tokenId;
        bool isPaired;
    }
    struct TokenStatus {
        //record tokenId reward debt position
        uint128 rewardsDebt;
        // identify if tokenId is in pool
        bool isInPool;
    }
    struct PoolState {
        // accumulated cApe reward for per NFT position
        uint128 accumulatedRewardsPerNft;
        // total NFT position count
        uint128 totalPosition;
        //tokenId => reward debt position
        mapping(uint256 => TokenStatus) tokenStatus;
        //for pair pool, apeTokenId => PairingStatus
        mapping(uint256 => PairingStatus) pairStatus;
        //pool cape debt token share
        uint256 cApeDebtShare;
    }

    struct VaultStorage {
        mapping(uint256 => PoolState) poolStates;
        address vaultBot;
        uint256 baycPairStakingRewardRatio;
        uint256 maycPairStakingRewardRatio;
    }
}
