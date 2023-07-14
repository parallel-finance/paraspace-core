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

    /**
     * @notice deposit Ape and BAKC pair into the pool
     * @param isBAYC if Ape is BAYC
     * @param apeTokenIds Ape token ids
     * @param bakcTokenIds BAKC token ids
     */
    function depositPairNFT(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external;

    /**
     * @notice stake pool's Ape and BAKC pair into ApeCoinStaking
     * @param isBAYC if Ape is BAYC
     * @param apeTokenIds Ape token ids
     * @param bakcTokenIds BAKC token ids
     */
    function stakingPairNFT(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external;

    /**
     * @notice claim Ape and BAKC pair staking reward from ApeCoinStaking and compound as cApe for user
     * only ape staking bot can call this function
     * @param isBAYC if Ape is BAYC
     * @param apeTokenIds Ape token ids
     * @param bakcTokenIds BAKC token ids
     */
    function compoundPairNFT(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external;

    /**
     * @notice get Ape and BAKC pair staking unclaimed cApe reward
     * @param isBAYC if Ape is BAYC
     * @param apeTokenIds Ape token ids
     * @param bakcTokenIds BAKC token ids
     */
    function pairNFTPendingReward(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external returns (uint256);

    /**
     * @notice claim Ape and BAKC pair staking unclaimed cApe reward
     * to save gas we don't claim pending reward in ApeCoinStaking.
     * @param isBAYC if Ape is BAYC
     * @param apeTokenIds Ape token ids
     * @param bakcTokenIds BAKC token ids
     */
    function claimPairNFT(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external;

    /**
     * @notice withdraw Ape and BAKC pair from pool
     * if the pair is staking it ApeCoinStaking, it will unstake from ApeCoinStaking first.
     * @param isBAYC if Ape is BAYC
     * @param apeTokenIds Ape token ids
     * @param bakcTokenIds BAKC token ids
     */
    function withdrawPairNFT(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external;

    /**
     * @notice deposit Ape or BAKC into the single pool
     * @param nft Ape or BAKC token address
     * @param tokenIds nft token ids
     */
    function depositNFT(address nft, uint32[] calldata tokenIds) external;

    /**
     * @notice stake pool's Ape into ApeCoinStaking
     * @param isBAYC if Ape is BAYC
     * @param tokenIds Ape token ids
     */
    function stakingApe(bool isBAYC, uint32[] calldata tokenIds) external;

    /**
     * @notice stake pool's Ape and BAKC into ApeCoinStaking pair staking pool
     * @param isBAYC if Ape is BAYC
     * @param apeTokenIds Ape token ids
     * @param bakcTokenIds BAKC token ids
     */
    function stakingBAKC(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external;

    /**
     * @notice claim Ape staking reward from ApeCoinStaking and compound as cApe for user
     * only ape staking bot can call this function
     * @param isBAYC if Ape is BAYC
     * @param tokenIds Ape token ids
     */
    function compoundApe(bool isBAYC, uint32[] calldata tokenIds) external;

    /**
     * @notice claim single pool's Ape and BAKC pair staking reward from ApeCoinStaking and compound as cApe for user
     * only ape staking bot can call this function
     * @param isBAYC if Ape is BAYC
     * @param apeTokenIds Ape token ids
     * @param bakcTokenIds BAKC token ids
     */
    function compoundBAKC(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external;

    /**
     * @notice get single pool nft unclaimed cApe reward
     * @param nft Ape or BAKC token address
     * @param tokenIds nft token ids
     */
    function nftPendingReward(address nft, uint32[] calldata tokenIds)
        external
        returns (uint256);

    /**
     * @notice claim single pool nft unclaimed cApe reward
     * to save gas we don't claim pending reward in ApeCoinStaking.
     * @param nft Ape or BAKC token address
     * @param tokenIds nft token ids
     */
    function claimNFT(address nft, uint32[] calldata tokenIds) external;

    /**
     * @notice withdraw nft from single pool
     * if the nft is staking it ApeCoinStaking, it will unstake from ApeCoinStaking first.
     * @param nft Ape or BAKC token address
     * @param tokenIds nft token ids
     */
    function withdrawNFT(address nft, uint32[] calldata tokenIds) external;
}
