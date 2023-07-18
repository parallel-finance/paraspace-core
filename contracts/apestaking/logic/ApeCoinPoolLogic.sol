// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IPool} from "../../interfaces/IPool.sol";
import "../../interfaces/IParaApeStaking.sol";
import {IERC20, SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {PercentageMath} from "../../protocol/libraries/math/PercentageMath.sol";
import "../../interfaces/IAutoCompoundApe.sol";
import "../../interfaces/ICApe.sol";
import "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {WadRayMath} from "../../protocol/libraries/math/WadRayMath.sol";
import "./ApeStakingCommonLogic.sol";
import "../../protocol/libraries/helpers/Errors.sol";

/**
 * @title ApeCoinPoolLogic library
 *
 * @notice Implements the base logic for para ape staking apecoin pool
 */
library ApeCoinPoolLogic {
    using PercentageMath for uint256;
    using SafeCast for uint256;
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

    uint256 public constant BAYC_BAKC_PAIR_POOL_ID = 1;
    uint256 public constant MAYC_BAKC_PAIR_POOL_ID = 2;
    uint256 public constant BAYC_SINGLE_POOL_ID = 3;
    uint256 public constant MAYC_SINGLE_POOL_ID = 4;

    uint256 constant BAYC_POOL_ID = 1;
    uint256 constant MAYC_POOL_ID = 2;
    uint256 constant BAKC_POOL_ID = 3;

    /**
     * @dev Minimum health factor to consider a user position healthy
     * A value of 1e18 results in 1
     */
    uint256 public constant HEALTH_FACTOR_LIQUIDATION_THRESHOLD = 1e18;

    event ApeCoinPoolDeposited(bool isBAYC, uint256 tokenId);
    event ApeCoinPoolCompounded(bool isBAYC, uint256 tokenId);
    event ApeCoinPoolClaimed(bool isBAYC, uint256 tokenId);
    event ApeCoinPoolWithdrew(bool isBAYC, uint256 tokenId);
    event ApeCoinPoolPairDeposited(
        bool isBAYC,
        uint256 apeTokenId,
        uint256 bakcTokenId
    );
    event ApeCoinPoolPairCompounded(
        bool isBAYC,
        uint256 apeTokenId,
        uint256 bakcTokenId
    );
    event ApeCoinPoolPairClaimed(bool isBAYC, uint256 apeTokenId);

    function depositApeCoinPool(
        IApeCoinPool.ApeCoinPoolState storage poolState,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        mapping(address => uint256) storage sApeBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata tokenIds
    ) external {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, Errors.INVALID_PARAMETER);

        if (isBAYC) {
            vars.apeToken = vars.bayc;
            vars.nApe = vars.nBayc;
            vars.positionCap = vars.baycMatchedCap;
        } else {
            vars.apeToken = vars.mayc;
            vars.nApe = vars.nMayc;
            vars.positionCap = vars.maycMatchedCap;
        }
        address msgSender = msg.sender;
        uint128 accumulatedRewardsPerNft = poolState.accumulatedRewardsPerNft;
        ApeCoinStaking.SingleNft[]
            memory _nfts = new ApeCoinStaking.SingleNft[](arrayLength);
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            require(
                msgSender == IERC721(vars.nApe).ownerOf(tokenId),
                Errors.NOT_THE_OWNER
            );

            uint256 currentMatchCount = apeMatchedCount[vars.apeToken][tokenId];
            if (currentMatchCount == 0) {
                IERC721(vars.apeToken).safeTransferFrom(
                    vars.nApe,
                    address(this),
                    tokenId
                );
            }
            apeMatchedCount[vars.apeToken][tokenId] = currentMatchCount + 1;

            //update status
            poolState
                .tokenStatus[tokenId]
                .rewardsDebt = accumulatedRewardsPerNft;
            poolState.tokenStatus[tokenId].isInPool = true;

            // construct staking data
            _nfts[index] = ApeCoinStaking.SingleNft({
                tokenId: tokenId,
                amount: vars.positionCap.toUint224()
            });

            //emit event
            emit ApeCoinPoolDeposited(isBAYC, tokenId);
        }

        //transfer ape coin
        uint256 totalApeCoinAmount = vars.positionCap * arrayLength;
        IERC20(vars.apeCoin).safeTransferFrom(
            msgSender,
            address(this),
            totalApeCoinAmount
        );
        sApeBalance[msgSender] += totalApeCoinAmount;

        //stake in ApeCoinStaking
        if (isBAYC) {
            vars.apeCoinStaking.depositBAYC(_nfts);
        } else {
            vars.apeCoinStaking.depositMAYC(_nfts);
        }

        poolState.totalPosition += arrayLength.toUint32();
    }

    function compoundApeCoinPool(
        IApeCoinPool.ApeCoinPoolState storage poolState,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata tokenIds
    ) external {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, Errors.INVALID_PARAMETER);

        uint256[] memory _nfts = new uint256[](arrayLength);
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            require(
                poolState.tokenStatus[tokenId].isInPool,
                "not in ape coin pool"
            );

            // construct staking data
            _nfts[index] = tokenId;

            emit ApeCoinPoolCompounded(isBAYC, tokenId);
        }

        vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
        //claim from ApeCoinStaking
        if (isBAYC) {
            vars.apeCoinStaking.claimSelfBAYC(_nfts);
        } else {
            vars.apeCoinStaking.claimSelfMAYC(_nfts);
        }
        vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
        vars.totalClaimedApe = vars.balanceAfter - vars.balanceBefore;
        IAutoCompoundApe(vars.cApe).deposit(
            address(this),
            vars.totalClaimedApe
        );

        uint256 cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
        uint256 cApeShare = vars.totalClaimedApe.rayDiv(cApeExchangeRate);
        uint256 compoundFee = cApeShare.percentMul(vars.compoundFee);
        cApeShare -= compoundFee;
        poolState.accumulatedRewardsPerNft +=
            cApeShare.toUint128() /
            poolState.totalPosition;

        if (compoundFee > 0) {
            cApeShareBalance[address(this)] += compoundFee;
        }
    }

    function claimApeCoinPool(
        IApeCoinPool.ApeCoinPoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata tokenIds
    ) external {
        ApeStakingCommonLogic.validateTokenIdArray(tokenIds);

        _claimApeCoinPool(poolState, vars, isBAYC, true, tokenIds);
    }

    function depositApeCoinPairPool(
        IApeCoinPool.ApeCoinPoolState storage poolState,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        mapping(address => uint256) storage sApeBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external {
        uint256 arrayLength = apeTokenIds.length;
        require(
            arrayLength == bakcTokenIds.length && arrayLength > 0,
            Errors.INVALID_PARAMETER
        );

        if (isBAYC) {
            vars.apeToken = vars.bayc;
            vars.nApe = vars.nBayc;
        } else {
            vars.apeToken = vars.mayc;
            vars.nApe = vars.nMayc;
        }
        vars.accumulatedRewardsPerNft = poolState.accumulatedRewardsPerNft;
        ApeCoinStaking.PairNftDepositWithAmount[]
            memory _nftPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                arrayLength
            );
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 apeTokenId = apeTokenIds[index];
            uint32 bakcTokenId = bakcTokenIds[index];

            //check ntoken owner
            {
                address nApeOwner = IERC721(vars.nApe).ownerOf(apeTokenId);
                address nBakcOwner = IERC721(vars.nBakc).ownerOf(bakcTokenId);
                require(
                    msg.sender == nApeOwner && msg.sender == nBakcOwner,
                    Errors.NOT_THE_OWNER
                );
            }

            uint256 currentMatchCount = apeMatchedCount[vars.apeToken][
                apeTokenId
            ];
            if (currentMatchCount == 0) {
                IERC721(vars.apeToken).safeTransferFrom(
                    vars.nApe,
                    address(this),
                    apeTokenId
                );
            }
            apeMatchedCount[vars.apeToken][apeTokenId] = currentMatchCount + 1;

            //update status
            poolState.tokenStatus[apeTokenId].rewardsDebt = vars
                .accumulatedRewardsPerNft;
            poolState.tokenStatus[apeTokenId].isInPool = true;

            IERC721(vars.bakc).safeTransferFrom(
                vars.nBakc,
                address(this),
                bakcTokenId
            );

            // construct staking data
            _nftPairs[index] = ApeCoinStaking.PairNftDepositWithAmount({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId,
                amount: vars.bakcMatchedCap.toUint184()
            });

            //emit event
            emit ApeCoinPoolPairDeposited(isBAYC, apeTokenId, bakcTokenId);
        }

        //transfer ape coin
        uint256 totalApeCoinAmount = vars.bakcMatchedCap * arrayLength;
        IERC20(vars.apeCoin).safeTransferFrom(
            msg.sender,
            address(this),
            totalApeCoinAmount
        );
        sApeBalance[msg.sender] += totalApeCoinAmount;

        //stake in ApeCoinStaking
        ApeCoinStaking.PairNftDepositWithAmount[]
            memory _otherPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                0
            );
        if (isBAYC) {
            vars.apeCoinStaking.depositBAKC(_nftPairs, _otherPairs);
        } else {
            vars.apeCoinStaking.depositBAKC(_otherPairs, _nftPairs);
        }

        poolState.totalPosition += arrayLength.toUint32();
    }

    function compoundApeCoinPairPool(
        IApeCoinPool.ApeCoinPoolState storage poolState,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external {
        uint256 arrayLength = apeTokenIds.length;
        require(
            arrayLength == bakcTokenIds.length && arrayLength > 0,
            Errors.INVALID_PARAMETER
        );

        ApeCoinStaking.PairNft[]
            memory _nftPairs = new ApeCoinStaking.PairNft[](arrayLength);
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 apeTokenId = apeTokenIds[index];
            uint32 bakcTokenId = bakcTokenIds[index];

            require(
                poolState.tokenStatus[apeTokenId].isInPool,
                "not in ape coin pool"
            );

            // construct staking data
            _nftPairs[index] = ApeCoinStaking.PairNft({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId
            });
        }

        vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
        //claim from ApeCoinStaking
        {
            ApeCoinStaking.PairNft[]
                memory _otherPairs = new ApeCoinStaking.PairNft[](0);
            if (isBAYC) {
                vars.apeCoinStaking.claimSelfBAKC(_nftPairs, _otherPairs);
            } else {
                vars.apeCoinStaking.claimSelfBAKC(_otherPairs, _nftPairs);
            }
        }
        vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
        vars.totalClaimedApe = vars.balanceAfter - vars.balanceBefore;
        IAutoCompoundApe(vars.cApe).deposit(
            address(this),
            vars.totalClaimedApe
        );

        uint256 cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
        uint256 cApeShare = vars.totalClaimedApe.rayDiv(cApeExchangeRate);
        uint256 compoundFee = cApeShare.percentMul(vars.compoundFee);
        cApeShare -= compoundFee;
        poolState.accumulatedRewardsPerNft +=
            cApeShare.toUint128() /
            poolState.totalPosition;

        if (compoundFee > 0) {
            cApeShareBalance[address(this)] += compoundFee;
        }
    }

    function claimApeCoinPairPool(
        IApeCoinPool.ApeCoinPoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata tokenIds
    ) external {
        ApeStakingCommonLogic.validateTokenIdArray(tokenIds);

        _claimApeCoinPool(poolState, vars, isBAYC, false, tokenIds);
    }

    function withdrawApeCoinPool(
        IApeCoinPool.ApeCoinPoolState storage poolState,
        mapping(address => mapping(uint32 => IParaApeStaking.ApeStatus))
            storage apesStatus,
        mapping(address => uint256) storage sApeBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata tokenIds,
        bool receiveApeCoin
    ) external {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, Errors.INVALID_PARAMETER);

        if (isBAYC) {
            vars.apeToken = vars.bayc;
            vars.nApe = vars.nBayc;
            vars.positionCap = vars.baycMatchedCap;
        } else {
            vars.apeToken = vars.mayc;
            vars.nApe = vars.nMayc;
            vars.positionCap = vars.maycMatchedCap;
        }
        address msgSender = msg.sender;
        ApeCoinStaking.SingleNft[]
            memory _nfts = new ApeCoinStaking.SingleNft[](arrayLength);
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            require(
                msgSender == IERC721(vars.nApe).ownerOf(tokenId),
                Errors.NOT_THE_OWNER
            );

            IParaApeStaking.ApeStatus memory cacheStatus = apesStatus[
                vars.apeToken
            ][tokenId];
            require(cacheStatus.isInApeCoinPool, "not in ape coin pool");
            cacheStatus.isInApeCoinPool = false;
            cacheStatus.matchedCount -= 1;
            //check if need transfer
            if (cacheStatus.matchedCount == 0) {
                IERC721(vars.apeToken).safeTransferFrom(
                    address(this),
                    vars.nApe,
                    tokenId
                );
            }
            //update status
            apesStatus[vars.apeToken][tokenId] = cacheStatus;

            // construct staking data
            _nfts[index] = ApeCoinStaking.SingleNft({
                tokenId: tokenId,
                amount: vars.positionCap.toUint224()
            });

            //emit event
            emit ApeCoinPoolWithdrew(isBAYC, tokenId);
        }

        //withdraw from ApeCoinStaking
        vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
        if (isBAYC) {
            vars.apeCoinStaking.withdrawSelfBAYC(_nfts);
        } else {
            vars.apeCoinStaking.withdrawSelfMAYC(_nfts);
        }
        vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
        vars.totalClaimedApe = vars.balanceAfter - vars.balanceBefore;

        uint256 totalApeCoinAmount = vars.positionCap * arrayLength;
        sApeBalance[msgSender] -= totalApeCoinAmount;
        if (receiveApeCoin) {
            (, , , , , uint256 healthFactor, ) = IPool(vars.pool)
                .getUserAccountData(msgSender);
            //need to check user health factor
            require(
                healthFactor >= HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
                Errors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
            );

            IERC20(vars.apeCoin).safeTransfer(msgSender, vars.totalClaimedApe);
        } else {
            IPool(vars.pool).supply(
                vars.apeCoin,
                vars.totalClaimedApe,
                msgSender,
                0
            );
        }
    }

    //    function _reduceSApeBalance()

    function _claimApeCoinPool(
        IApeCoinPool.ApeCoinPoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        bool isSinglePool,
        uint32[] calldata apeTokenIds
    ) internal {
        (
            address owner,
            uint256 pendingReward,
            uint128 accumulatedRewardsPerNft
        ) = calculatePendingReward(poolState, vars, isBAYC, apeTokenIds);

        if (pendingReward > 0) {
            uint256 arrayLength = apeTokenIds.length;
            for (uint256 index = 0; index < arrayLength; index++) {
                uint32 apeTokenId = apeTokenIds[index];

                poolState
                    .tokenStatus[apeTokenId]
                    .rewardsDebt = accumulatedRewardsPerNft;

                //emit event
                if (isSinglePool) {
                    emit ApeCoinPoolClaimed(isBAYC, apeTokenId);
                } else {
                    emit ApeCoinPoolPairClaimed(isBAYC, apeTokenId);
                }
            }

            IERC20(vars.cApe).safeTransfer(owner, pendingReward);
        }
    }

    function calculatePendingReward(
        IApeCoinPool.ApeCoinPoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata tokenIds
    )
        public
        view
        returns (
            address claimFor,
            uint256 pendingReward,
            uint128 accumulatedRewardsPerNft
        )
    {
        uint256 rewardShares;
        uint256 arrayLength = tokenIds.length;
        accumulatedRewardsPerNft = poolState.accumulatedRewardsPerNft;
        address nApe = isBAYC ? vars.nBayc : vars.nMayc;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            //just need to check ape ntoken owner
            {
                address nApeOwner = IERC721(nApe).ownerOf(tokenId);
                if (claimFor == address(0)) {
                    claimFor = nApeOwner;
                } else {
                    require(nApeOwner == claimFor, Errors.NOT_THE_SAME_OWNER);
                }
            }

            //check is in pool
            require(
                poolState.tokenStatus[tokenId].isInPool,
                "not in ape coin pool"
            );

            //update reward, to save gas we don't claim pending reward in ApeCoinStaking.
            rewardShares += (accumulatedRewardsPerNft -
                poolState.tokenStatus[tokenId].rewardsDebt);
        }
        pendingReward = ICApe(vars.cApe).getPooledApeByShares(rewardShares);

        return (claimFor, pendingReward, accumulatedRewardsPerNft);
    }
}
