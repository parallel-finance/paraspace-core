// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IPool} from "../../interfaces/IPool.sol";
import "../../interfaces/IParaApeStaking.sol";
import {IERC20, SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {PercentageMath} from "../../protocol/libraries/math/PercentageMath.sol";
import "../../interfaces/IAutoCompoundApe.sol";
import "../../interfaces/ICApe.sol";
import {SignatureChecker} from "../../dependencies/looksrare/contracts/libraries/SignatureChecker.sol";
import "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {WadRayMath} from "../../protocol/libraries/math/WadRayMath.sol";
import "./ApeStakingCommonLogic.sol";

/**
 * @title ApeStakingPairPoolLogic library
 *
 * @notice Implements the base logic for ape staking vault
 */
library ApeStakingPairPoolLogic {
    using PercentageMath for uint256;
    using SafeCast for uint256;
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

    uint256 public constant BAYC_BAKC_PAIR_POOL_ID = 1;
    uint256 public constant MAYC_BAKC_PAIR_POOL_ID = 2;
    uint256 public constant BAYC_SINGLE_POOL_ID = 3;
    uint256 public constant MAYC_SINGLE_POOL_ID = 4;
    uint256 public constant BAKC_SINGLE_POOL_ID = 5;

    uint256 constant BAYC_POOL_ID = 1;
    uint256 constant MAYC_POOL_ID = 2;
    uint256 constant BAKC_POOL_ID = 3;

    event PairNFTDeposited(
        bool isBAYC,
        uint256 apeTokenId,
        uint256 bakcTokenId
    );
    event PairNFTStaked(bool isBAYC, uint256 apeTokenId, uint256 bakcTokenId);
    event PairNFTWithdrew(bool isBAYC, uint256 apeTokenId, uint256 bakcTokenId);
    event PairNFTClaimed(bool isBAYC, uint256 apeTokenId, uint256 bakcTokenId);
    event PairNFTCompounded(
        bool isBAYC,
        uint256 apeTokenId,
        uint256 bakcTokenId
    );

    function depositPairNFT(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external {
        uint256 arrayLength = apeTokenIds.length;
        require(
            arrayLength == bakcTokenIds.length && arrayLength > 0,
            "wrong param"
        );

        vars.apeStakingPoolId = isBAYC ? BAYC_POOL_ID : MAYC_POOL_ID;
        vars.apeToken = isBAYC ? vars.bayc : vars.mayc;
        vars.nApe = isBAYC ? vars.nBayc : vars.nMayc;
        address msgSender = msg.sender;
        vars.accumulatedRewardsPerNft = poolState.accumulatedRewardsPerNft;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 apeTokenId = apeTokenIds[index];
            uint32 bakcTokenId = bakcTokenIds[index];

            //check ntoken owner
            {
                address nApeOwner = IERC721(vars.nApe).ownerOf(apeTokenId);
                address nBakcOwner = IERC721(vars.nBakc).ownerOf(bakcTokenId);
                require(
                    msgSender == nApeOwner && msgSender == nBakcOwner,
                    "not owner"
                );
            }

            // check both ape and bakc are not staking
            {
                (uint256 stakedAmount, ) = vars.apeCoinStaking.nftPosition(
                    vars.apeStakingPoolId,
                    apeTokenId
                );
                require(stakedAmount == 0, "ape already staked");
                (stakedAmount, ) = vars.apeCoinStaking.nftPosition(
                    BAKC_POOL_ID,
                    bakcTokenId
                );
                require(stakedAmount == 0, "bakc already staked");
                (, bool isPaired) = vars.apeCoinStaking.mainToBakc(
                    vars.apeStakingPoolId,
                    apeTokenId
                );
                require(!isPaired, "ape already pair staked");
            }

            //update pair status
            poolState.pairStatus[apeTokenId] = IApeStakingVault.PairingStatus({
                tokenId: bakcTokenId,
                isPaired: true
            });

            //update token status
            poolState.tokenStatus[apeTokenId] = IApeStakingVault.TokenStatus({
                rewardsDebt: vars.accumulatedRewardsPerNft,
                isInPool: true
            });

            //transfer ape and BAKC
            IERC721(vars.apeToken).safeTransferFrom(
                vars.nApe,
                address(this),
                apeTokenId
            );
            IERC721(vars.bakc).safeTransferFrom(
                vars.nBakc,
                address(this),
                bakcTokenId
            );

            //emit event
            emit PairNFTDeposited(isBAYC, apeTokenId, bakcTokenId);
        }

        poolState.totalPosition += arrayLength.toUint128();
    }

    function stakingPairNFT(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external {
        uint256 arrayLength = apeTokenIds.length;
        require(
            arrayLength == bakcTokenIds.length && arrayLength > 0,
            "wrong param"
        );

        ApeCoinStaking.SingleNft[]
            memory _nfts = new ApeCoinStaking.SingleNft[](arrayLength);
        ApeCoinStaking.PairNftDepositWithAmount[]
            memory _nftPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                arrayLength
            );
        vars.positionCap = isBAYC ? vars.baycMatchedCap : vars.maycMatchedCap;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 apeTokenId = apeTokenIds[index];
            uint32 bakcTokenId = bakcTokenIds[index];

            // check pair status
            {
                IApeStakingVault.PairingStatus
                    memory localPairStatus = poolState.pairStatus[apeTokenId];
                require(
                    localPairStatus.tokenId == bakcTokenId &&
                        localPairStatus.isPaired,
                    "wrong pair status"
                );
            }

            // construct staking data
            _nfts[index] = ApeCoinStaking.SingleNft({
                tokenId: apeTokenId,
                amount: vars.positionCap.toUint224()
            });
            _nftPairs[index] = ApeCoinStaking.PairNftDepositWithAmount({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId,
                amount: vars.bakcMatchedCap.toUint184()
            });

            //emit event
            emit PairNFTStaked(isBAYC, apeTokenId, bakcTokenId);
        }

        // prepare Ape coin
        uint256 totalBorrow = (vars.positionCap + vars.bakcMatchedCap) *
            arrayLength;
        ApeStakingCommonLogic.borrowCApeFromPool(poolState, vars, totalBorrow);

        //stake in ApeCoinStaking
        ApeCoinStaking.PairNftDepositWithAmount[]
            memory _otherPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                0
            );
        if (isBAYC) {
            vars.apeCoinStaking.depositBAYC(_nfts);
            vars.apeCoinStaking.depositBAKC(_nftPairs, _otherPairs);
        } else {
            vars.apeCoinStaking.depositMAYC(_nfts);
            vars.apeCoinStaking.depositBAKC(_otherPairs, _nftPairs);
        }
    }

    function withdrawPairNFT(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external {
        uint256 arrayLength = apeTokenIds.length;
        require(
            arrayLength == bakcTokenIds.length && arrayLength > 0,
            "wrong param"
        );

        _claimPairNFT(poolState, vars, isBAYC, apeTokenIds, bakcTokenIds);

        vars.apeStakingPoolId = isBAYC ? BAYC_POOL_ID : MAYC_POOL_ID;
        vars.apeToken = isBAYC ? vars.bayc : vars.mayc;
        vars.nApe = isBAYC ? vars.nBayc : vars.nMayc;
        vars.positionCap = isBAYC ? vars.baycMatchedCap : vars.maycMatchedCap;
        vars._nfts = new ApeCoinStaking.SingleNft[](arrayLength);
        vars._nftPairs = new ApeCoinStaking.PairNftWithdrawWithAmount[](
            arrayLength
        );
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 apeTokenId = apeTokenIds[index];
            uint32 bakcTokenId = bakcTokenIds[index];

            //check pair status
            require(
                poolState.pairStatus[apeTokenId].tokenId == bakcTokenId,
                "wrong ape and bakc pair"
            );

            //check ntoken owner
            {
                address nApeOwner = IERC721(vars.nApe).ownerOf(apeTokenId);
                address nBakcOwner = IERC721(vars.nBakc).ownerOf(bakcTokenId);
                address msgSender = msg.sender;
                require(
                    msgSender == nApeOwner || msgSender == nBakcOwner,
                    "not owner"
                );
            }

            // update pair status
            delete poolState.pairStatus[apeTokenId];
            delete poolState.tokenStatus[apeTokenId];

            // we only need to check pair staking position
            (, bool isPaired) = vars.apeCoinStaking.mainToBakc(
                vars.apeStakingPoolId,
                apeTokenId
            );
            if (isPaired) {
                vars._nfts[vars.stakingPair] = ApeCoinStaking.SingleNft({
                    tokenId: apeTokenId,
                    amount: vars.positionCap.toUint224()
                });

                vars._nftPairs[vars.stakingPair] = ApeCoinStaking
                    .PairNftWithdrawWithAmount({
                        mainTokenId: apeTokenId,
                        bakcTokenId: bakcTokenId,
                        amount: vars.bakcMatchedCap.toUint184(),
                        isUncommit: true
                    });
                vars.stakingPair++;
            }
        }

        //update state
        poolState.totalPosition -= arrayLength.toUint128();

        //withdraw from ApeCoinStaking and compound
        if (vars.stakingPair > 0) {
            {
                ApeCoinStaking.SingleNft[] memory _nfts = vars._nfts;
                ApeCoinStaking.PairNftWithdrawWithAmount[]
                    memory _nftPairs = vars._nftPairs;
                uint256 stakingPair = vars.stakingPair;
                assembly {
                    mstore(_nfts, stakingPair)
                }
                assembly {
                    mstore(_nftPairs, stakingPair)
                }
            }

            vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
            ApeCoinStaking.PairNftWithdrawWithAmount[]
                memory _otherPairs = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                    0
                );
            if (isBAYC) {
                vars.apeCoinStaking.withdrawBAYC(vars._nfts, address(this));
                vars.apeCoinStaking.withdrawBAKC(vars._nftPairs, _otherPairs);
            } else {
                vars.apeCoinStaking.withdrawMAYC(vars._nfts, address(this));
                vars.apeCoinStaking.withdrawBAKC(_otherPairs, vars._nftPairs);
            }
            vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
            uint256 balanceDiff = vars.balanceAfter - vars.balanceBefore;
            IAutoCompoundApe(vars.cApe).deposit(address(this), balanceDiff);

            uint256 totalRepay = ApeStakingCommonLogic.calculateRepayAndCompound(
                poolState,
                vars,
                balanceDiff,
                vars.positionCap + vars.bakcMatchedCap
            );

            if (totalRepay > 0) {
                IERC20(vars.cApe).safeApprove(vars.pool, totalRepay);
                IPool(vars.pool).repay(vars.cApe, totalRepay, address(this));
            }
        }

        //transfer ape and BAKC back to nToken
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 apeTokenId = apeTokenIds[index];
            uint32 bakcTokenId = bakcTokenIds[index];

            IERC721(vars.apeToken).safeTransferFrom(
                address(this),
                vars.nApe,
                apeTokenId
            );
            IERC721(vars.bakc).safeTransferFrom(
                address(this),
                vars.nBakc,
                bakcTokenId
            );

            //emit event
            emit PairNFTWithdrew(isBAYC, apeTokenId, bakcTokenId);
        }
    }

    function claimPairNFT(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external {
        uint256 arrayLength = apeTokenIds.length;
        require(
            arrayLength == bakcTokenIds.length && arrayLength > 0,
            "wrong param"
        );

        _claimPairNFT(poolState, vars, isBAYC, apeTokenIds, bakcTokenIds);
    }

    function compoundPairNFT(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external {
        uint256 arrayLength = apeTokenIds.length;
        require(
            arrayLength == bakcTokenIds.length && arrayLength > 0,
            "wrong param"
        );

        uint256[] memory _nfts = new uint256[](arrayLength);
        ApeCoinStaking.PairNft[]
            memory _nftPairs = new ApeCoinStaking.PairNft[](arrayLength);
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 apeTokenId = apeTokenIds[index];
            uint32 bakcTokenId = bakcTokenIds[index];

            // check pair status
            IApeStakingVault.PairingStatus memory localPairStatus = poolState
                .pairStatus[apeTokenId];
            require(
                localPairStatus.tokenId == bakcTokenId &&
                    localPairStatus.isPaired,
                "wrong pair status"
            );

            // construct staking data
            _nfts[index] = apeTokenId;
            _nftPairs[index] = ApeCoinStaking.PairNft({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId
            });

            //emit event
            emit PairNFTCompounded(isBAYC, apeTokenId, bakcTokenId);
        }

        vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));

        //claim from ApeCoinStaking
        {
            ApeCoinStaking.PairNft[]
                memory _otherPairs = new ApeCoinStaking.PairNft[](0);
            if (isBAYC) {
                vars.apeCoinStaking.claimSelfBAYC(_nfts);
                vars.apeCoinStaking.claimSelfBAKC(_nftPairs, _otherPairs);
            } else {
                vars.apeCoinStaking.claimSelfMAYC(_nfts);
                vars.apeCoinStaking.claimSelfBAKC(_otherPairs, _nftPairs);
            }
        }

        vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
        uint256 balanceDiff = vars.balanceAfter - vars.balanceBefore;
        IAutoCompoundApe(vars.cApe).deposit(address(this), balanceDiff);

        //repay and compound
        vars.positionCap = isBAYC ? vars.baycMatchedCap : vars.maycMatchedCap;
        uint256 totalRepay = ApeStakingCommonLogic.calculateRepayAndCompound(
            poolState,
            vars,
            balanceDiff,
            vars.positionCap + vars.bakcMatchedCap
        );

        if (totalRepay > 0) {
            IERC20(vars.cApe).safeApprove(vars.pool, totalRepay);
            IPool(vars.pool).repay(vars.cApe, totalRepay, address(this));
        }
    }

    function _claimPairNFT(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) internal {
        vars.accumulatedRewardsPerNft = poolState.accumulatedRewardsPerNft;
        uint256 rewardShares;
        address claimFor;
        uint256 arrayLength = apeTokenIds.length;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 apeTokenId = apeTokenIds[index];
            uint32 bakcTokenId = bakcTokenIds[index];

            //just need to check ape ntoken owner
            {
                address nApe = isBAYC ? vars.nBayc : vars.nMayc;
                address nApeOwner = IERC721(nApe).ownerOf(apeTokenId);
                if (claimFor == address(0)) {
                    claimFor = nApeOwner;
                } else {
                    require(nApeOwner == claimFor, "claim not for same owner");
                }
            }

            //check pair status
            require(
                poolState.pairStatus[apeTokenId].tokenId == bakcTokenId,
                "wrong ape and bakc pair"
            );

            //update reward, to save gas we don't claim pending reward in ApeCoinStaking.
            rewardShares += (vars.accumulatedRewardsPerNft -
                poolState.tokenStatus[apeTokenId].rewardsDebt);
            poolState.tokenStatus[apeTokenId].rewardsDebt = vars
                .accumulatedRewardsPerNft;

            //emit event
            emit PairNFTClaimed(isBAYC, apeTokenId, bakcTokenId);
        }

        if (rewardShares > 0) {
            IERC20(vars.cApe).safeTransfer(claimFor, rewardShares);
        }
    }




}
