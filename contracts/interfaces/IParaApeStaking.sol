// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

import "../dependencies/yoga-labs/ApeCoinStaking.sol";
import "./IApeStakingVault.sol";
import "./IApeStakingP2P.sol";
import "./IApeCoinPool.sol";

interface IParaApeStaking is IApeStakingVault, IApeStakingP2P, IApeCoinPool {
    struct ApeStakingVaultCacheVars {
        address pool;
        address bayc;
        address mayc;
        address bakc;
        address nBayc;
        address nMayc;
        address nBakc;
        address apeCoin;
        address cApe;
        ApeCoinStaking apeCoinStaking;
        uint256 baycMatchedCap;
        uint256 maycMatchedCap;
        uint256 bakcMatchedCap;
        //optional
        bytes32 DOMAIN_SEPARATOR;
        uint256 compoundFee;
        address apeToken;
        address nApe;
        uint256 apeStakingPoolId;
        uint256 positionCap;
        uint128 accumulatedRewardsPerNft;
        uint256 balanceBefore;
        uint256 balanceAfter;
        uint256 totalClaimedApe;
        uint256 apeRewardRatio;
        uint256 totalRepay;
        uint256 totalCompoundFee;
        uint256 cApeExchangeRate;
        uint256 latestBorrowIndex;
        bool isPaired;
    }

    struct ApeStatus {
        uint32 matchedCount;
        bool isInApeCoinPool;
        bool isInApeCoinPairPool;
    }

    struct SApeBalance {
        uint128 freeBalance;
        uint128 stakedBalance;
    }

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
        //pool cape debt token share, max value for uint104 is 2e31, ape coin total supply is 1e27.
        uint104 cApeDebtShare;
        // accumulated cApe reward for per NFT position
        uint104 accumulatedRewardsPerNft;
        // total NFT position count, max value for uint24 is 16777216
        uint24 totalPosition;
        // total staking position
        uint24 stakingPosition;
        //tokenId => reward debt position
        mapping(uint256 => TokenStatus) tokenStatus;
        //for pair pool, apeTokenId => PairingStatus
        mapping(uint256 => PairingStatus) pairStatus;
    }

    struct BAKCPoolState {
        // accumulated cApe reward for per NFT position
        uint104 accumulatedRewardsPerNft;
        // total NFT position count
        uint24 totalPosition;
        //bayc pair cape debt token share
        uint104 baycCApeDebtShare;
        //bayc pair staking position
        uint24 baycStakingPosition;
        //mayc pair cape debt token share
        uint104 maycCApeDebtShare;
        //mayc pair staking position
        uint24 maycStakingPosition;
        //tokenId => reward debt position
        mapping(uint256 => TokenStatus) tokenStatus;
    }

    struct ApeCoinPoolState {
        // total NFT position count
        uint32 totalPosition;
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
     * @dev Emitted during setApeStakingBot()
     * @param oldBot The address of the old compound bot
     * @param newBot The address of the new compound bot
     **/
    event ApeStakingBotUpdated(address oldBot, address newBot);

    event CompoundFeeUpdated(uint64 oldValue, uint64 newValue);
}
