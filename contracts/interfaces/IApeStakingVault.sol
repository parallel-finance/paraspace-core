// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

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
        //pool cape debt token share
        uint128 cApeDebtShare;
        // total NFT position count
        uint32 totalPosition;
        // total staking position
        uint32 stakingPosition;
        // accumulated cApe reward for per NFT position
        uint128 accumulatedRewardsPerNft;
        //tokenId => reward debt position
        mapping(uint256 => TokenStatus) tokenStatus;
        //for pair pool, apeTokenId => PairingStatus
        mapping(uint256 => PairingStatus) pairStatus;
    }

    struct BAKCPoolState {
        // total NFT position count
        uint32 totalPosition;
        //bayc pair cape debt token share
        uint128 baycCApeDebtShare;
        //bayc pair staking position
        uint32 baycStakingPosition;
        //mayc pair cape debt token share
        uint128 maycCApeDebtShare;
        //mayc pair staking position
        uint32 maycStakingPosition;
        // accumulated cApe reward for per NFT position
        uint128 accumulatedRewardsPerNft;
        //tokenId => reward debt position
        mapping(uint256 => TokenStatus) tokenStatus;
    }

    struct VaultStorage {
        mapping(uint256 => PoolState) poolStates;
        BAKCPoolState bakcPoolState;
        uint128 baycPairStakingRewardRatio;
        uint128 maycPairStakingRewardRatio;
    }

    /**
     * @dev Emitted during setSinglePoolApeRewardRatio()
     * @param oldRatio The value of the old baycPairStakingRewardRatio
     * @param newRatio The value of the new baycPairStakingRewardRatio
     **/
    event BaycPairStakingRewardRatioUpdated(uint128 oldRatio, uint128 newRatio);

    /**
     * @dev Emitted during setSinglePoolApeRewardRatio()
     * @param oldRatio The value of the old maycPairStakingRewardRatio
     * @param newRatio The value of the new maycPairStakingRewardRatio
     **/
    event MaycPairStakingRewardRatioUpdated(uint128 oldRatio, uint128 newRatio);
}
