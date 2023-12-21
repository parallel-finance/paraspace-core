// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {BridgeERC721Message, ERC721DelegationMessage} from "../BridgeDefine.sol";

interface IVaultApeStaking {
    struct TokenStatus {
        //record tokenId reward debt position
        uint128 rewardsDebt;
        // income beneficiary
        address beneficiary;
        // is staking
        bool isStaking;
        // is paired with bakc, only for bayc/mayc
        bool isPairedStaking;
        // is paired with bayc, only for bakc
        bool isPairedWithBayc;
        // paired staking token id, bakc tokenId for bayc/mayc, ape tokenId for bakc
        uint32 pairTokenId;
    }

    struct PoolState {
        // accumulated cApe reward for per NFT position
        uint128 accumulatedRewardsPerNft;
        // total NFT position count, max value for uint32 is 4294967296
        uint32 totalPosition;
        // total NFT staking position
        uint32 stakingPosition;
        // total NFT pair staking position, only for bayc/mayc
        uint32 pairStakingPosition;
        // cApe income ratio
        uint32 cApeIncomeRatio;
        //tokenId => reward debt position
        mapping(uint256 => TokenStatus) tokenStatus;
    }

    struct BAKCPairActionInfo {
        uint32[] baycTokenIds;
        uint32[] bakcPairBaycTokenIds;
        uint32[] maycTokenIds;
        uint32[] bakcPairMaycTokenIds;
    }

    /**
     * @dev Emitted during setApeStakingBot()
     * @param oldBot The address of the old compound bot
     * @param newBot The address of the new compound bot
     **/
    event ApeStakingBotUpdated(address oldBot, address newBot);

    /**
     * @dev Emitted during setCApeIncomeRate()
     * @param nft identify pool
     * @param oldValue The value of the old cApe income rate
     * @param newValue The value of the new cApe income rate
     **/
    event CApeIncomeRateUpdated(address nft, uint32 oldValue, uint32 newValue);

    /**
     * @dev Emitted during setCompoundFeeRate()
     * @param oldValue The old value of compound fee rate
     * @param newValue The new value of compound fee rate
     **/
    event CompoundFeeRateUpdated(uint32 oldValue, uint32 newValue);

    /**
     * @dev Emitted during claimCompoundFee()
     * @param amount The amount of fee claimed
     **/
    event CompoundFeeClaimed(uint256 amount);

    /**
     * @dev Emitted during claimPendingReward()
     * @param nft identify which pool user claimed from
     * @param tokenId identify position token id
     * @param rewardAmount Reward amount claimed
     **/
    event PoolRewardClaimed(address nft, uint256 tokenId, uint256 rewardAmount);

    /**
     * @dev Emitted during updateBeneficiary()
     * @param nft identify which pool user claimed from
     * @param tokenId identify position token id
     * @param newBenificiary new benificiary for the token id
     **/
    event BeneficiaryUpdated(
        address nft,
        uint256 tokenId,
        address newBenificiary
    );

    event ApeStaked(bool isBAYC, uint256 tokenId);
    event BakcStaked(bool isBAYC, uint256 apeTokenId, uint256 bakcTokenId);
    event ApeCompounded(bool isBAYC, uint256 tokenId);
    event BakcCompounded(bool isBAYC, uint256 apeTokenId, uint256 bakcTokenId);

    /**
     * @notice Query token status for the specified pool and nft
     * @param nft Identify pool
     * @param tokenId The tokenId of the nft
     */
    function getTokenStatus(
        address nft,
        uint256 tokenId
    ) external view returns (TokenStatus memory);

    /**
     * @notice Query position pending reward in the pool, will revert if token id is not in the pool
     * @param nft Identify pool
     * @param tokenIds The tokenIds of the nft
     */
    function getPendingReward(
        address nft,
        uint32[] calldata tokenIds
    ) external view returns (uint256);

    /**
     * @notice Claim position pending reward in the pool, will revert if token id is not in the pool
     * @param nft Identify pool
     * @param tokenIds The tokenIds of the nft
     */
    function claimPendingReward(
        address nft,
        uint32[] calldata tokenIds
    ) external;

    /**
     * @notice stake pool's Ape into ApeCoinStaking
     * @param isBAYC if Ape is BAYC
     * @param tokenIds Ape token ids
     */
    function stakingApe(bool isBAYC, uint32[] calldata tokenIds) external;

    /**
     * @notice stake pool's Ape and BAKC into ApeCoinStaking pair staking pool
     * @param actionInfo detail staking info
     */
    function stakingBAKC(BAKCPairActionInfo calldata actionInfo) external;

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
     * @param actionInfo detail staking info
     */
    function compoundBAKC(BAKCPairActionInfo calldata actionInfo) external;

    function onboardCheckApeStakingPosition(
        address nft,
        uint32 tokenId,
        address beneficiary
    ) external;

    function offboardCheckApeStakingPosition(
        address nft,
        uint32 tokenId
    ) external;

    function unstakeApe(bool isBAYC, uint32[] calldata tokenIds) external;

    function setApeStakingBot(address _apeStakingBot) external;

    function setCompoundFeeRate(uint32 _compoundFeeRate) external;

    function claimCompoundFee(address receiver) external;

    function updateBeneficiary(
        address nft,
        uint32[] calldata tokenIds,
        address newBenificiary
    ) external;

    function pause() external;

    function unpause() external;

    function initialize() external;

    function compoundFee() external view returns (uint256);

    function setCApeIncomeRate(address nft, uint32 rate) external;
}
