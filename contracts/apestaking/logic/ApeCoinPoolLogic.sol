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
import {UserConfiguration} from "../../protocol/libraries/configuration/UserConfiguration.sol";
import {DataTypes} from "../../protocol/libraries/types/DataTypes.sol";

/**
 * @title ApeCoinPoolLogic library
 *
 * @notice Implements the base logic for para ape staking apecoin pool
 */
library ApeCoinPoolLogic {
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using PercentageMath for uint256;
    using SafeCast for uint256;
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

    uint256 public constant BAYC_APECOIN_POOL_ID = 1;
    uint256 public constant MAYC_APECOIN_POOL_ID = 2;
    uint256 public constant BAYC_BAKC_APECOIN_POOL_ID = 3;
    uint256 public constant MAYC_BAKC_APECOIN_POOL_ID = 4;

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
    event ApeCoinPairPoolDeposited(
        bool isBAYC,
        uint256 apeTokenId,
        uint256 bakcTokenId
    );
    event ApeCoinPairPoolCompounded(
        bool isBAYC,
        uint256 apeTokenId,
        uint256 bakcTokenId
    );
    event ApeCoinPairPoolClaimed(bool isBAYC, uint256 apeTokenId);
    event ApeCoinPairPoolWithdrew(
        bool isBAYC,
        uint256 apeTokenId,
        uint256 bakcTokenId
    );

    function withdrawSApe(
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
        address pool,
        address apeCoin,
        uint16 sApeReserveId,
        address user,
        uint128 amount
    ) external {
        IParaApeStaking.SApeBalance memory sApeBalanceCache = sApeBalance[user];
        require(sApeBalanceCache.freeBalance >= amount, "balance not enough");
        sApeBalanceCache.freeBalance -= amount;

        DataTypes.UserConfigurationMap memory userConfig = IPool(pool)
            .getUserConfiguration(user);
        bool usageAsCollateralEnabled = userConfig.isUsingAsCollateral(
            sApeReserveId
        );
        if (usageAsCollateralEnabled) {
            (, , , , , uint256 healthFactor, ) = IPool(pool).getUserAccountData(
                user
            );
            //need to check user health factor
            require(
                healthFactor >= HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
                Errors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
            );
        }

        IERC20(apeCoin).safeTransfer(user, amount);
    }

    function depositApeCoinPool(
        IParaApeStaking.ApeCoinPoolState storage poolState,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
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
        uint256 totalApeCoinNeeded = vars.positionCap * arrayLength;
        _prepareApeCoin(
            sApeBalance,
            vars,
            totalApeCoinNeeded.toUint128(),
            msgSender
        );

        //stake in ApeCoinStaking
        if (isBAYC) {
            vars.apeCoinStaking.depositBAYC(_nfts);
        } else {
            vars.apeCoinStaking.depositMAYC(_nfts);
        }

        poolState.totalPosition += arrayLength.toUint32();
    }

    function compoundApeCoinPool(
        IParaApeStaking.ApeCoinPoolState storage poolState,
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
        _distributePoolReward(
            poolState,
            cApeShareBalance,
            vars,
            vars.totalClaimedApe,
            poolState.totalPosition
        );
    }

    function claimApeCoinPool(
        IParaApeStaking.ApeCoinPoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata tokenIds
    ) external {
        ApeStakingCommonLogic.validateTokenIdArray(tokenIds);

        _claimApeCoinPool(poolState, vars, isBAYC, true, tokenIds);
    }

    function withdrawApeCoinPool(
        IParaApeStaking.ApeCoinPoolState storage poolState,
        mapping(address => uint256) storage cApeShareBalance,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata tokenIds
    ) external {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, Errors.INVALID_PARAMETER);

        _claimApeCoinPool(poolState, vars, isBAYC, true, tokenIds);

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

            require(
                poolState.tokenStatus[tokenId].isInPool,
                "not in ape coin pool"
            );

            uint256 matchedCount = apeMatchedCount[vars.apeToken][tokenId];
            if (matchedCount == 1) {
                IERC721(vars.apeToken).safeTransferFrom(
                    address(this),
                    vars.nApe,
                    tokenId
                );
            }
            apeMatchedCount[vars.apeToken][tokenId] = matchedCount - 1;
            delete poolState.tokenStatus[tokenId];

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

        uint128 totalApeCoinAmount = (vars.bakcMatchedCap * arrayLength)
            .toUint128();
        IParaApeStaking.SApeBalance memory sApeBalanceCache = sApeBalance[
            msgSender
        ];
        sApeBalanceCache.stakedBalance -= totalApeCoinAmount;
        sApeBalanceCache.freeBalance += totalApeCoinAmount;
        sApeBalance[msgSender] = sApeBalanceCache;

        //distribute reward
        uint32 totalPosition = poolState.totalPosition;
        totalPosition -= arrayLength.toUint32();
        if (vars.totalClaimedApe > totalApeCoinAmount) {
            _distributePoolReward(
                poolState,
                cApeShareBalance,
                vars,
                vars.totalClaimedApe - totalApeCoinAmount,
                totalPosition
            );
        }
        poolState.totalPosition = totalPosition;
    }

    function depositApeCoinPairPool(
        IParaApeStaking.ApeCoinPoolState storage poolState,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
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
            emit ApeCoinPairPoolDeposited(isBAYC, apeTokenId, bakcTokenId);
        }

        //transfer ape coin
        uint256 totalApeCoinNeeded = vars.bakcMatchedCap * arrayLength;
        _prepareApeCoin(
            sApeBalance,
            vars,
            totalApeCoinNeeded.toUint128(),
            msg.sender
        );

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
        IParaApeStaking.ApeCoinPoolState storage poolState,
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
        _distributePoolReward(
            poolState,
            cApeShareBalance,
            vars,
            vars.totalClaimedApe,
            poolState.totalPosition
        );
    }

    function claimApeCoinPairPool(
        IParaApeStaking.ApeCoinPoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata tokenIds
    ) external {
        ApeStakingCommonLogic.validateTokenIdArray(tokenIds);

        _claimApeCoinPool(poolState, vars, isBAYC, false, tokenIds);
    }

    function withdrawApeCoinPairPool(
        IParaApeStaking.ApeCoinPoolState storage poolState,
        mapping(address => uint256) storage cApeShareBalance,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
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

        _claimApeCoinPool(poolState, vars, isBAYC, false, apeTokenIds);

        if (isBAYC) {
            vars.apeToken = vars.bayc;
            vars.nApe = vars.nBayc;
        } else {
            vars.apeToken = vars.mayc;
            vars.nApe = vars.nMayc;
        }
        address nApeOwner;
        ApeCoinStaking.PairNftWithdrawWithAmount[]
            memory _nftPairs = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                arrayLength
            );
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 apeTokenId = apeTokenIds[index];
            uint32 bakcTokenId = bakcTokenIds[index];

            //check ntoken owner
            {
                address tmpApeOwner = IERC721(vars.nApe).ownerOf(apeTokenId);
                if (nApeOwner == address(0)) {
                    nApeOwner = tmpApeOwner;
                } else {
                    require(
                        nApeOwner == tmpApeOwner,
                        Errors.NOT_THE_SAME_OWNER
                    );
                }
                if (nApeOwner != msg.sender) {
                    address nBakcOwner = IERC721(vars.nBakc).ownerOf(
                        bakcTokenId
                    );
                    require(msg.sender == nBakcOwner, Errors.NOT_THE_OWNER);
                }
            }

            require(
                poolState.tokenStatus[apeTokenId].isInPool,
                "not in ape coin pool"
            );

            //transfer nft
            {
                uint256 matchedCount = apeMatchedCount[vars.apeToken][
                    apeTokenId
                ];
                if (matchedCount == 1) {
                    IERC721(vars.apeToken).safeTransferFrom(
                        address(this),
                        vars.apeToken,
                        apeTokenId
                    );
                }
                apeMatchedCount[vars.apeToken][apeTokenId] = matchedCount - 1;
                IERC721(vars.bakc).safeTransferFrom(
                    address(this),
                    vars.nBakc,
                    bakcTokenId
                );
            }

            delete poolState.tokenStatus[apeTokenId];

            // construct staking data
            _nftPairs[index] = ApeCoinStaking.PairNftWithdrawWithAmount({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId,
                amount: vars.bakcMatchedCap.toUint184(),
                isUncommit: true
            });

            //emit event
            emit ApeCoinPairPoolWithdrew(isBAYC, apeTokenId, bakcTokenId);
        }

        //withdraw from ApeCoinStaking
        {
            vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
            ApeCoinStaking.PairNftWithdrawWithAmount[]
                memory _otherPairs = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                    0
                );
            if (isBAYC) {
                vars.apeCoinStaking.withdrawBAKC(_nftPairs, _otherPairs);
            } else {
                vars.apeCoinStaking.withdrawBAKC(_otherPairs, _nftPairs);
            }
            vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
            vars.totalClaimedApe = vars.balanceAfter - vars.balanceBefore;
        }

        uint128 totalApeCoinAmount = (vars.bakcMatchedCap * arrayLength)
            .toUint128();
        {
            IParaApeStaking.SApeBalance memory sApeBalanceCache = sApeBalance[
                nApeOwner
            ];
            sApeBalanceCache.stakedBalance -= totalApeCoinAmount;
            sApeBalanceCache.freeBalance += totalApeCoinAmount;
            sApeBalance[nApeOwner] = sApeBalanceCache;
        }

        //distribute reward
        uint32 totalPosition = poolState.totalPosition;
        totalPosition -= arrayLength.toUint32();
        if (vars.totalClaimedApe > totalApeCoinAmount) {
            _distributePoolReward(
                poolState,
                cApeShareBalance,
                vars,
                vars.totalClaimedApe - totalApeCoinAmount,
                totalPosition
            );
        }
        poolState.totalPosition = totalPosition;
    }

    function calculatePendingReward(
        IParaApeStaking.ApeCoinPoolState storage poolState,
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

    function _prepareApeCoin(
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        uint128 totalApeCoinNeeded,
        address user
    ) internal {
        IParaApeStaking.SApeBalance memory sApeBalanceCache = sApeBalance[user];
        if (sApeBalanceCache.freeBalance < totalApeCoinNeeded) {
            IERC20(vars.apeCoin).safeTransferFrom(
                user,
                address(this),
                totalApeCoinNeeded - sApeBalanceCache.freeBalance
            );
            sApeBalanceCache.freeBalance = 0;
        } else {
            sApeBalanceCache.freeBalance -= totalApeCoinNeeded;
        }
        sApeBalanceCache.stakedBalance += totalApeCoinNeeded;
        sApeBalance[user] = sApeBalanceCache;
    }

    function _claimApeCoinPool(
        IParaApeStaking.ApeCoinPoolState storage poolState,
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
                    emit ApeCoinPairPoolClaimed(isBAYC, apeTokenId);
                }
            }

            IERC20(vars.cApe).safeTransfer(owner, pendingReward);
        }
    }

    function _distributePoolReward(
        IParaApeStaking.ApeCoinPoolState storage poolState,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        uint256 rewardAmount,
        uint32 totalPosition
    ) internal {
        IAutoCompoundApe(vars.cApe).deposit(address(this), rewardAmount);

        uint256 cApeShare = ICApe(vars.cApe).getShareByPooledApe(rewardAmount);
        uint256 compoundFee = cApeShare.percentMul(vars.compoundFee);
        cApeShare -= compoundFee;
        poolState.accumulatedRewardsPerNft +=
            cApeShare.toUint128() /
            totalPosition;

        if (compoundFee > 0) {
            cApeShareBalance[address(this)] += compoundFee;
        }
    }
}
