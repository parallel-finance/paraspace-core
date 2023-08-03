// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IPool} from "../../interfaces/IPool.sol";
import "../../interfaces/IParaApeStaking.sol";
import "../../interfaces/IApeCoinPool.sol";
import "../../interfaces/ITimeLock.sol";
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

    event ApeCoinPoolDeposited(bool isBAYC, uint256 tokenId);
    event ApeCoinPoolCompounded(bool isBAYC, uint256 tokenId);
    event ApeCoinPoolClaimed(bool isBAYC, uint256 tokenId, uint256 rewardShare);
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
    event ApeCoinPairPoolWithdrew(
        bool isBAYC,
        uint256 apeTokenId,
        uint256 bakcTokenId
    );

    function getPendingReward(
        IParaApeStaking.PoolState storage poolState,
        address cApe,
        uint32[] memory tokenIds
    ) external view returns (uint256) {
        uint256 rewardShares;
        uint256 arrayLength = tokenIds.length;
        uint256 accumulatedRewardsPerNft = poolState.accumulatedRewardsPerNft;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            IParaApeStaking.TokenStatus memory tokenStatus = poolState
                .tokenStatus[tokenId];
            require(tokenStatus.isInPool, Errors.NFT_NOT_IN_POOL);

            rewardShares += (accumulatedRewardsPerNft -
                tokenStatus.rewardsDebt);
        }
        return ICApe(cApe).getPooledApeByShares(rewardShares);
    }

    function claimPendingReward(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        uint256 poolId,
        uint32[] calldata tokenIds
    ) external {
        ApeStakingCommonLogic.validateTokenIdArray(tokenIds);
        (address nft, address nToken) = ApeStakingCommonLogic.getNftFromPoolId(
            vars,
            poolId
        );
        ApeStakingCommonLogic.claimPendingReward(
            poolState,
            vars,
            poolId,
            nft,
            nToken,
            true,
            tokenIds
        );
    }

    function depositFreeSApe(
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
        address apeCoin,
        address cApe,
        address user,
        address cashAsset,
        uint128 amount
    ) external {
        require(
            cashAsset == cApe || cashAsset == apeCoin,
            Errors.INVALID_TOKEN
        );

        IERC20(cashAsset).safeTransferFrom(user, address(this), amount);

        if (cashAsset == apeCoin) {
            IAutoCompoundApe(cApe).deposit(address(this), amount);
        }

        //update sApe balance
        IParaApeStaking.SApeBalance memory sApeBalanceCache = sApeBalance[user];
        uint256 shareAmount = ICApe(cApe).getShareByPooledApe(amount);
        sApeBalanceCache.freeShareBalance += shareAmount.toUint128();
        sApeBalance[user] = sApeBalanceCache;
    }

    function withdrawFreeSApe(
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
        address pool,
        address apeCoin,
        address cApe,
        uint16 sApeReserveId,
        address user,
        address receiveAsset,
        uint128 amount
    ) external {
        require(
            receiveAsset == cApe || receiveAsset == apeCoin,
            Errors.INVALID_TOKEN
        );

        IParaApeStaking.SApeBalance memory sApeBalanceCache = sApeBalance[user];
        uint256 shareAmount = ICApe(cApe).getShareByPooledApe(amount);
        require(
            sApeBalanceCache.freeShareBalance >= shareAmount,
            Errors.SAPE_FREE_BALANCE_NOT_ENOUGH
        );
        sApeBalanceCache.freeShareBalance -= shareAmount.toUint128();
        sApeBalance[user] = sApeBalanceCache;

        _validateDropSApeBalance(pool, sApeReserveId, user);
        if (receiveAsset == apeCoin) {
            IAutoCompoundApe(cApe).withdraw(amount);
        }
        _sendUserFunds(pool, receiveAsset, amount, user);
    }

    function depositApeCoinPool(
        IParaApeStaking.PoolState storage poolState,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        IParaApeStaking.ApeCoinDepositInfo calldata depositInfo
    ) external {
        uint256 arrayLength = depositInfo.tokenIds.length;
        require(arrayLength > 0, Errors.INVALID_PARAMETER);

        if (depositInfo.isBAYC) {
            vars.apeToken = vars.bayc;
            vars.nApe = vars.nBayc;
            vars.positionCap = vars.baycMatchedCap;
        } else {
            vars.apeToken = vars.mayc;
            vars.nApe = vars.nMayc;
            vars.positionCap = vars.maycMatchedCap;
        }
        uint128 accumulatedRewardsPerNft = poolState.accumulatedRewardsPerNft;
        ApeCoinStaking.SingleNft[]
            memory _nfts = new ApeCoinStaking.SingleNft[](arrayLength);
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = depositInfo.tokenIds[index];

            require(
                depositInfo.onBehalf == IERC721(vars.nApe).ownerOf(tokenId),
                Errors.NOT_THE_OWNER
            );

            ApeStakingCommonLogic.handleApeTransferIn(
                apeMatchedCount,
                vars.apeToken,
                vars.nApe,
                tokenId
            );

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
            emit ApeCoinPoolDeposited(depositInfo.isBAYC, tokenId);
        }

        //transfer ape coin
        uint256 totalApeCoinNeeded = vars.positionCap * arrayLength;
        _prepareApeCoin(
            sApeBalance,
            vars,
            totalApeCoinNeeded.toUint128(),
            depositInfo.cashToken,
            depositInfo.cashAmount,
            depositInfo.onBehalf
        );

        //stake in ApeCoinStaking
        if (depositInfo.isBAYC) {
            vars.apeCoinStaking.depositBAYC(_nfts);
        } else {
            vars.apeCoinStaking.depositMAYC(_nfts);
        }

        poolState.totalPosition += arrayLength.toUint24();
    }

    function compoundApeCoinPool(
        IParaApeStaking.PoolState storage poolState,
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
                Errors.NFT_NOT_IN_POOL
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

    function withdrawApeCoinPool(
        IParaApeStaking.PoolState storage poolState,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        IParaApeStaking.ApeCoinWithdrawInfo memory withdrawInfo,
        uint256 poolId
    ) public {
        uint256 arrayLength = withdrawInfo.tokenIds.length;
        require(arrayLength > 0, Errors.INVALID_PARAMETER);

        if (withdrawInfo.isBAYC) {
            vars.apeToken = vars.bayc;
            vars.nApe = vars.nBayc;
            vars.positionCap = vars.baycMatchedCap;
        } else {
            vars.apeToken = vars.mayc;
            vars.nApe = vars.nMayc;
            vars.positionCap = vars.maycMatchedCap;
        }

        address nApeOwner = ApeStakingCommonLogic.claimPendingReward(
            poolState,
            vars,
            poolId,
            vars.apeToken,
            vars.nApe,
            false,
            withdrawInfo.tokenIds
        );

        address msgSender = msg.sender;
        require(
            msgSender == nApeOwner || msgSender == vars.nApe,
            Errors.NOT_THE_OWNER
        );
        ApeCoinStaking.SingleNft[]
            memory _nfts = new ApeCoinStaking.SingleNft[](arrayLength);
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = withdrawInfo.tokenIds[index];

            // we don't need check pair is in pool here again

            delete poolState.tokenStatus[tokenId];

            // construct staking data
            _nfts[index] = ApeCoinStaking.SingleNft({
                tokenId: tokenId,
                amount: vars.positionCap.toUint224()
            });
        }

        //withdraw from ApeCoinStaking
        vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
        if (withdrawInfo.isBAYC) {
            vars.apeCoinStaking.withdrawSelfBAYC(_nfts);
        } else {
            vars.apeCoinStaking.withdrawSelfMAYC(_nfts);
        }
        vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
        vars.totalClaimedApe = vars.balanceAfter - vars.balanceBefore;

        uint128 totalApeCoinAmount = (vars.positionCap * arrayLength)
            .toUint128();
        _handleApeCoin(
            sApeBalance,
            vars,
            totalApeCoinAmount,
            withdrawInfo.cashToken,
            withdrawInfo.cashAmount,
            nApeOwner
        );

        //distribute reward
        uint24 totalPosition = poolState.totalPosition;
        totalPosition -= arrayLength.toUint24();
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

        //transfer ape and BAKC back to nToken
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = withdrawInfo.tokenIds[index];

            ApeStakingCommonLogic.handleApeTransferOut(
                apeMatchedCount,
                vars.apeToken,
                vars.nApe,
                tokenId
            );

            //emit event
            emit ApeCoinPoolWithdrew(withdrawInfo.isBAYC, tokenId);
        }
    }

    function depositApeCoinPairPool(
        IParaApeStaking.PoolState storage poolState,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        IParaApeStaking.ApeCoinPairDepositInfo calldata depositInfo
    ) external {
        uint256 arrayLength = depositInfo.apeTokenIds.length;
        require(
            arrayLength == depositInfo.bakcTokenIds.length && arrayLength > 0,
            Errors.INVALID_PARAMETER
        );

        if (depositInfo.isBAYC) {
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
            uint32 apeTokenId = depositInfo.apeTokenIds[index];
            uint32 bakcTokenId = depositInfo.bakcTokenIds[index];

            //check ntoken owner
            {
                address nApeOwner = IERC721(vars.nApe).ownerOf(apeTokenId);
                address nBakcOwner = IERC721(vars.nBakc).ownerOf(bakcTokenId);
                require(
                    depositInfo.onBehalf == nApeOwner &&
                        depositInfo.onBehalf == nBakcOwner,
                    Errors.NOT_THE_OWNER
                );
            }

            ApeStakingCommonLogic.handleApeTransferIn(
                apeMatchedCount,
                vars.apeToken,
                vars.nApe,
                apeTokenId
            );
            IERC721(vars.bakc).safeTransferFrom(
                vars.nBakc,
                address(this),
                bakcTokenId
            );

            //update status
            poolState.tokenStatus[apeTokenId].rewardsDebt = vars
                .accumulatedRewardsPerNft;
            poolState.tokenStatus[apeTokenId].isInPool = true;
            poolState.tokenStatus[apeTokenId].bakcTokenId = bakcTokenId;

            // construct staking data
            _nftPairs[index] = ApeCoinStaking.PairNftDepositWithAmount({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId,
                amount: vars.bakcMatchedCap.toUint184()
            });

            //emit event
            emit ApeCoinPairPoolDeposited(
                depositInfo.isBAYC,
                apeTokenId,
                bakcTokenId
            );
        }

        //transfer ape coin
        uint256 totalApeCoinNeeded = vars.bakcMatchedCap * arrayLength;
        _prepareApeCoin(
            sApeBalance,
            vars,
            totalApeCoinNeeded.toUint128(),
            depositInfo.cashToken,
            depositInfo.cashAmount,
            depositInfo.onBehalf
        );

        //stake in ApeCoinStaking
        ApeCoinStaking.PairNftDepositWithAmount[]
            memory _otherPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                0
            );
        if (depositInfo.isBAYC) {
            vars.apeCoinStaking.depositBAKC(_nftPairs, _otherPairs);
        } else {
            vars.apeCoinStaking.depositBAKC(_otherPairs, _nftPairs);
        }

        poolState.totalPosition += arrayLength.toUint24();
    }

    function compoundApeCoinPairPool(
        IParaApeStaking.PoolState storage poolState,
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
                Errors.NFT_NOT_IN_POOL
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

    function withdrawApeCoinPairPool(
        IParaApeStaking.PoolState storage poolState,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        IParaApeStaking.ApeCoinPairWithdrawInfo memory withdrawInfo,
        uint256 poolId
    ) public {
        uint256 arrayLength = withdrawInfo.apeTokenIds.length;
        require(
            arrayLength == withdrawInfo.bakcTokenIds.length && arrayLength > 0,
            Errors.INVALID_PARAMETER
        );

        if (withdrawInfo.isBAYC) {
            vars.apeToken = vars.bayc;
            vars.nApe = vars.nBayc;
        } else {
            vars.apeToken = vars.mayc;
            vars.nApe = vars.nMayc;
        }

        address nApeOwner = ApeStakingCommonLogic.claimPendingReward(
            poolState,
            vars,
            poolId,
            vars.apeToken,
            vars.nApe,
            false,
            withdrawInfo.apeTokenIds
        );

        ApeCoinStaking.PairNftWithdrawWithAmount[]
            memory _nftPairs = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                arrayLength
            );
        bool isBAKCOwnerWithdraw = false;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 apeTokenId = withdrawInfo.apeTokenIds[index];
            uint32 bakcTokenId = withdrawInfo.bakcTokenIds[index];

            //check ntoken owner
            {
                if (nApeOwner != msg.sender && vars.nApe != msg.sender) {
                    address nBakcOwner = IERC721(vars.nBakc).ownerOf(
                        bakcTokenId
                    );
                    require(msg.sender == nBakcOwner, Errors.NOT_THE_OWNER);
                    isBAKCOwnerWithdraw = true;
                }
            }

            // we don't need check pair is in pool here again

            delete poolState.tokenStatus[apeTokenId];

            // construct staking data
            _nftPairs[index] = ApeCoinStaking.PairNftWithdrawWithAmount({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId,
                amount: vars.bakcMatchedCap.toUint184(),
                isUncommit: true
            });
        }

        //withdraw from ApeCoinStaking
        {
            vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
            ApeCoinStaking.PairNftWithdrawWithAmount[]
                memory _otherPairs = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                    0
                );
            if (withdrawInfo.isBAYC) {
                vars.apeCoinStaking.withdrawBAKC(_nftPairs, _otherPairs);
            } else {
                vars.apeCoinStaking.withdrawBAKC(_otherPairs, _nftPairs);
            }
            vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
            vars.totalClaimedApe = vars.balanceAfter - vars.balanceBefore;
        }

        uint128 totalApeCoinAmount = (vars.bakcMatchedCap * arrayLength)
            .toUint128();
        _handleApeCoin(
            sApeBalance,
            vars,
            totalApeCoinAmount,
            withdrawInfo.cashToken,
            isBAKCOwnerWithdraw ? 0 : withdrawInfo.cashAmount,
            nApeOwner
        );

        //distribute reward
        uint24 totalPosition = poolState.totalPosition;
        totalPosition -= arrayLength.toUint24();
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

        //transfer ape and BAKC back to nToken
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 apeTokenId = withdrawInfo.apeTokenIds[index];
            uint32 bakcTokenId = withdrawInfo.bakcTokenIds[index];

            ApeStakingCommonLogic.handleApeTransferOut(
                apeMatchedCount,
                vars.apeToken,
                vars.nApe,
                apeTokenId
            );
            IERC721(vars.bakc).safeTransferFrom(
                address(this),
                vars.nBakc,
                bakcTokenId
            );

            //emit event
            emit ApeCoinPairPoolWithdrew(
                withdrawInfo.isBAYC,
                apeTokenId,
                bakcTokenId
            );
        }
    }

    function tryUnstakeApeCoinPoolPosition(
        mapping(uint256 => IParaApeStaking.PoolState) storage poolStates,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata tokenIds
    ) external {
        require(tokenIds.length > 0, Errors.INVALID_PARAMETER);

        // check single
        {
            uint256 singlePoolId = isBAYC
                ? ApeStakingCommonLogic.BAYC_APECOIN_POOL_ID
                : ApeStakingCommonLogic.MAYC_APECOIN_POOL_ID;

            uint32[] memory singlePoolTokenIds = new uint32[](tokenIds.length);
            uint256 singleCount = 0;
            for (uint256 index = 0; index < tokenIds.length; index++) {
                uint32 tokenId = tokenIds[index];

                IParaApeStaking.TokenStatus
                    memory singlePoolTokenStatus = poolStates[singlePoolId]
                        .tokenStatus[tokenId];
                if (singlePoolTokenStatus.isInPool) {
                    singlePoolTokenIds[singleCount] = tokenId;
                    singleCount++;
                }
            }

            if (singleCount > 0) {
                assembly {
                    mstore(singlePoolTokenIds, singleCount)
                }

                withdrawApeCoinPool(
                    poolStates[singlePoolId],
                    apeMatchedCount,
                    sApeBalance,
                    cApeShareBalance,
                    vars,
                    IApeCoinPool.ApeCoinWithdrawInfo({
                        cashToken: vars.cApe,
                        cashAmount: 0,
                        isBAYC: isBAYC,
                        tokenIds: singlePoolTokenIds
                    }),
                    singlePoolId
                );
            }
        }

        // check pair
        {
            uint256 pairPoolId = isBAYC
                ? ApeStakingCommonLogic.BAYC_BAKC_APECOIN_POOL_ID
                : ApeStakingCommonLogic.MAYC_BAKC_APECOIN_POOL_ID;

            uint32[] memory parePoolTokenIds = new uint32[](tokenIds.length);
            uint32[] memory bakcTokenIds = new uint32[](tokenIds.length);
            uint256 pairCount = 0;
            for (uint256 index = 0; index < tokenIds.length; index++) {
                uint32 tokenId = tokenIds[index];

                IParaApeStaking.TokenStatus
                    memory pairPoolTokenStatus = poolStates[pairPoolId]
                        .tokenStatus[tokenId];
                if (pairPoolTokenStatus.isInPool) {
                    parePoolTokenIds[pairCount] = tokenId;
                    bakcTokenIds[pairCount] = pairPoolTokenStatus.bakcTokenId;
                    pairCount++;
                }
            }

            if (pairCount > 0) {
                assembly {
                    mstore(parePoolTokenIds, pairCount)
                    mstore(bakcTokenIds, pairCount)
                }

                withdrawApeCoinPairPool(
                    poolStates[pairPoolId],
                    apeMatchedCount,
                    sApeBalance,
                    cApeShareBalance,
                    vars,
                    IApeCoinPool.ApeCoinPairWithdrawInfo({
                        cashToken: vars.cApe,
                        cashAmount: 0,
                        isBAYC: isBAYC,
                        apeTokenIds: parePoolTokenIds,
                        bakcTokenIds: bakcTokenIds
                    }),
                    pairPoolId
                );
            }
        }
    }

    function _prepareApeCoin(
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        uint128 totalApeCoinNeeded,
        address cashToken,
        uint256 cashAmount,
        address user
    ) internal {
        require(
            cashToken == vars.cApe || cashToken == vars.apeCoin,
            Errors.INVALID_TOKEN
        );
        require(cashAmount <= totalApeCoinNeeded, Errors.INVALID_CASH_AMOUNT);

        if (cashAmount != 0) {
            IERC20(cashToken).safeTransferFrom(user, address(this), cashAmount);
        }

        uint256 cApeWithdrawAmount = (cashToken == vars.apeCoin)
            ? 0
            : cashAmount;
        IParaApeStaking.SApeBalance memory sApeBalanceCache = sApeBalance[user];
        if (cashAmount < totalApeCoinNeeded) {
            uint256 freeSApeBalanceNeeded = totalApeCoinNeeded - cashAmount;
            uint256 freeShareBalanceNeeded = ICApe(vars.cApe)
                .getShareByPooledApe(freeSApeBalanceNeeded);
            require(
                sApeBalanceCache.freeShareBalance >= freeShareBalanceNeeded,
                Errors.SAPE_FREE_BALANCE_NOT_ENOUGH
            );
            sApeBalanceCache.freeShareBalance -= freeShareBalanceNeeded
                .toUint128();
            cApeWithdrawAmount += freeSApeBalanceNeeded;
        }

        if (cApeWithdrawAmount > 0) {
            IAutoCompoundApe(vars.cApe).withdraw(cApeWithdrawAmount);
        }

        sApeBalanceCache.stakedBalance += totalApeCoinNeeded;
        sApeBalance[user] = sApeBalanceCache;
    }

    function _handleApeCoin(
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        uint128 totalApeCoinWithdrew,
        address cashToken,
        uint256 cashAmount,
        address user
    ) internal {
        require(
            cashToken == vars.cApe || cashToken == vars.apeCoin,
            Errors.INVALID_TOKEN
        );
        require(cashAmount <= totalApeCoinWithdrew, Errors.INVALID_CASH_AMOUNT);

        uint256 cApeDepositAmount = (cashToken == vars.apeCoin)
            ? 0
            : cashAmount;
        IParaApeStaking.SApeBalance memory sApeBalanceCache = sApeBalance[user];
        if (cashAmount < totalApeCoinWithdrew) {
            uint256 freeSApeBalanceAdded = totalApeCoinWithdrew - cashAmount;
            uint256 freeShareBalanceAdded = ICApe(vars.cApe)
                .getShareByPooledApe(freeSApeBalanceAdded);
            sApeBalanceCache.freeShareBalance += freeShareBalanceAdded
                .toUint128();
            cApeDepositAmount += freeSApeBalanceAdded;
        }
        sApeBalanceCache.stakedBalance -= totalApeCoinWithdrew;
        sApeBalance[user] = sApeBalanceCache;

        if (cApeDepositAmount > 0) {
            IAutoCompoundApe(vars.cApe).deposit(
                address(this),
                cApeDepositAmount
            );
        }

        if (cashAmount > 0) {
            _validateDropSApeBalance(vars.pool, vars.sApeReserveId, user);
            _sendUserFunds(vars.pool, cashToken, cashAmount, user);
        }
    }

    function _distributePoolReward(
        IParaApeStaking.PoolState storage poolState,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        uint256 rewardAmount,
        uint24 totalPosition
    ) internal {
        IAutoCompoundApe(vars.cApe).deposit(address(this), rewardAmount);

        uint256 cApeShare = ICApe(vars.cApe).getShareByPooledApe(rewardAmount);
        uint256 compoundFee = cApeShare;
        if (totalPosition != 0) {
            compoundFee = cApeShare.percentMul(vars.compoundFee);
            cApeShare -= compoundFee;
            poolState.accumulatedRewardsPerNft +=
                cApeShare.toUint104() /
                totalPosition;
        }

        if (compoundFee > 0) {
            cApeShareBalance[address(this)] += compoundFee;
        }
    }

    function _validateDropSApeBalance(
        address pool,
        uint16 sApeReserveId,
        address user
    ) internal view {
        DataTypes.UserConfigurationMap memory userConfig = IPool(pool)
            .getUserConfiguration(user);
        bool usageAsCollateralEnabled = userConfig.isUsingAsCollateral(
            sApeReserveId
        );
        if (usageAsCollateralEnabled && userConfig.isBorrowingAny()) {
            (, , , , , uint256 healthFactor, ) = IPool(pool).getUserAccountData(
                user
            );
            //need to check user health factor
            require(
                healthFactor >=
                    ApeStakingCommonLogic.HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
                Errors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
            );
        }
    }

    function _sendUserFunds(
        address pool,
        address asset,
        uint256 amount,
        address user
    ) internal {
        address receiver = user;
        DataTypes.TimeLockParams memory timeLockParams = IPool(pool)
            .calculateTimeLockParams(asset, amount);
        if (timeLockParams.releaseTime != 0) {
            ITimeLock timeLock = IPool(pool).TIME_LOCK();
            uint256[] memory amounts = new uint256[](1);
            amounts[0] = amount;

            timeLock.createAgreement(
                DataTypes.AssetType.ERC20,
                DataTypes.TimeLockActionType.WITHDRAW,
                address(0),
                asset,
                amounts,
                user,
                timeLockParams.releaseTime
            );
            receiver = address(timeLock);
        }
        IERC20(asset).safeTransfer(receiver, amount);
    }
}
