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
        uint16 sApeReserveId;
        address nApeOwner;
    }

    struct SApeBalance {
        //cApe share
        uint128 freeShareBalance;
        //staked ape coin
        uint128 stakedBalance;
    }

    struct TokenStatus {
        //record tokenId reward debt position
        uint128 rewardsDebt;
        // identify if tokenId is in pool
        bool isInPool;
        // pair bakc token, only for pair pool
        uint32 bakcTokenId;
        // is paird with bakc, only for pair pool
        bool isPaired;
    }

    struct PoolState {
        //pool cape debt token share, max value for uint104 is 2e31, ape coin total supply is 1e27. only for pool staking
        uint104 cApeDebtShare;
        // accumulated cApe reward for per NFT position
        uint104 accumulatedRewardsPerNft;
        // total NFT position count, max value for uint24 is 16777216
        uint24 totalPosition;
        // total staking position, used for calculate interest debt, . only for pool staking
        uint24 stakingPosition;
        //tokenId => reward debt position
        mapping(uint256 => TokenStatus) tokenStatus;
    }

    /**
     * @dev Emitted during setApeStakingBot()
     * @param oldBot The address of the old compound bot
     * @param newBot The address of the new compound bot
     **/
    event ApeStakingBotUpdated(address oldBot, address newBot);

    /**
     * @dev Emitted during setCompoundFee()
     * @param oldValue The old value of compound fee
     * @param newValue The new value of compound fee
     **/
    event CompoundFeeUpdated(uint64 oldValue, uint64 newValue);

    /**
     * @notice Query token status for the specified pool and nft
     * @param poolId Identify pool
     * @param tokenId The tokenId of the nft
     */
    function poolTokenStatus(uint256 poolId, uint256 tokenId)
        external
        view
        returns (IParaApeStaking.TokenStatus memory);

    /**
     * @notice Query position pending reward in the pool, will revert if token id is not in the pool
     * @param poolId Identify pool
     * @param tokenIds The tokenIds of the nft
     */
    function getPendingReward(uint256 poolId, uint32[] calldata tokenIds)
        external
        view
        returns (uint256);

    /**
     * @notice Claim position pending reward in the pool, will revert if token id is not in the pool
     * @param poolId Identify pool
     * @param tokenIds The tokenIds of the nft
     */
    function claimPendingReward(uint256 poolId, uint32[] calldata tokenIds)
        external;

    function stakedSApeBalance(address user) external view returns (uint256);

    function freeSApeBalance(address user) external view returns (uint256);

    function totalSApeBalance(address user) external view returns (uint256);

    function transferFreeSApeBalance(
        address from,
        address to,
        uint256 amount
    ) external;

    function withdrawFreeSApe(address receiver, uint128 amount) external;
}
