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
 * @title ApeStakingSinglePoolLogic library
 *
 * @notice Implements the base logic for ape staking vault
 */
library ApeStakingSinglePoolLogic {
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

    event NFTDeposited(address nft, uint256 tokenId);
    event NFTStaked(address nft, uint256 tokenId);
    event NFTPairStaked(address nft, uint256 apeTokenId, uint256 bakcTokenId);
    event NFTCompounded(address nft, uint256 tokenId);
    event NFTClaimed(address nft, uint256 tokenId);
    event NFTWithdrawn(address nft, uint256 tokenId);

    function depositNFT(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) external {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, "wrong param");

        address msgSender = msg.sender;
        vars.accumulatedRewardsPerNft = poolState.accumulatedRewardsPerNft;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            if (nft == vars.bakc) {
                address nTokenOwner = IERC721(vars.nBakc).ownerOf(tokenId);
                require(msgSender == nTokenOwner, "not owner");

                (uint256 stakedAmount, ) = vars.apeCoinStaking.nftPosition(
                    BAKC_POOL_ID,
                    tokenId
                );
                require(stakedAmount == 0, "bakc already staked");

                IERC721(nft).safeTransferFrom(
                    vars.nBakc,
                    address(this),
                    tokenId
                );
            } else {
                vars.nApe = (nft == vars.bayc) ? vars.nBayc : vars.nMayc;
                vars.apeStakingPoolId = (nft == vars.bayc)
                    ? BAYC_POOL_ID
                    : MAYC_POOL_ID;

                address nApeOwner = IERC721(vars.nApe).ownerOf(tokenId);
                require(msgSender == nApeOwner, "not ape owner");

                (uint256 stakedAmount, ) = vars.apeCoinStaking.nftPosition(
                    vars.apeStakingPoolId,
                    tokenId
                );
                require(stakedAmount == 0, "ape already staked");

                (, bool isPaired) = vars.apeCoinStaking.mainToBakc(
                    vars.apeStakingPoolId,
                    tokenId
                );
                require(!isPaired, "ape already pair staked");

                IERC721(nft).safeTransferFrom(
                    vars.nApe,
                    address(this),
                    tokenId
                );
            }

            //update token status
            poolState.tokenStatus[tokenId] = IApeStakingVault.TokenStatus({
                rewardsDebt: vars.accumulatedRewardsPerNft,
                isInPool: true
            });

            //emit event
            emit NFTDeposited(nft, tokenId);
        }

        poolState.totalPosition += arrayLength.toUint64();
    }

    function stakingApe(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) external {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, "wrong param");

        ApeCoinStaking.SingleNft[]
            memory _nfts = new ApeCoinStaking.SingleNft[](arrayLength);
        vars.positionCap = (nft == vars.bayc)
            ? vars.baycMatchedCap
            : vars.maycMatchedCap;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            require(
                poolState.tokenStatus[tokenId].isInPool,
                "ape not in single pool"
            );

            // construct staking data
            _nfts[index] = ApeCoinStaking.SingleNft({
                tokenId: tokenId,
                amount: vars.positionCap.toUint224()
            });

            //emit event
            emit NFTStaked(nft, tokenId);
        }

        // prepare Ape coin
        uint256 totalBorrow = vars.positionCap * arrayLength;
        ApeStakingCommonLogic.borrowCApeFromPool(poolState, vars, totalBorrow);

        //stake in ApeCoinStaking
        if (nft == vars.bayc) {
            vars.apeCoinStaking.depositBAYC(_nfts);
        } else {
            vars.apeCoinStaking.depositMAYC(_nfts);
        }

        poolState.stakingPosition += arrayLength.toUint64();
    }

    function stakingBAKC(
        IParaApeStaking.PoolState storage apePoolState,
        IParaApeStaking.PoolState storage bakcPoolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external {
        uint256 arrayLength = apeTokenIds.length;
        require(
            arrayLength == bakcTokenIds.length && arrayLength > 0,
            "wrong param"
        );

        ApeCoinStaking.PairNftDepositWithAmount[]
            memory _nftPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                arrayLength
            );
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 apeTokenId = apeTokenIds[index];
            uint32 bakcTokenId = bakcTokenIds[index];

            require(
                apePoolState.tokenStatus[apeTokenId].isInPool,
                "ape not in single pool"
            );
            require(
                bakcPoolState.tokenStatus[bakcTokenId].isInPool,
                "ape not in single pool"
            );

            // construct staking data
            _nftPairs[index] = ApeCoinStaking.PairNftDepositWithAmount({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId,
                amount: vars.bakcMatchedCap.toUint184()
            });

            //emit event
            emit NFTPairStaked(nft, apeTokenId, bakcTokenId);
        }

        // prepare Ape coin
        uint256 totalBorrow = vars.bakcMatchedCap * arrayLength;
        ApeStakingCommonLogic.borrowCApeFromPool(
            bakcPoolState,
            vars,
            totalBorrow
        );

        //stake in ApeCoinStaking
        ApeCoinStaking.PairNftDepositWithAmount[]
            memory _otherPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                0
            );
        if (nft == vars.bayc) {
            vars.apeCoinStaking.depositBAKC(_nftPairs, _otherPairs);
        } else {
            vars.apeCoinStaking.depositBAKC(_otherPairs, _nftPairs);
        }

        bakcPoolState.stakingPosition += arrayLength.toUint64();
    }

    function compoundApe(
        IParaApeStaking.PoolState storage poolState,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) external {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, "wrong param");

        uint256[] memory _nfts = new uint256[](arrayLength);
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            require(
                poolState.tokenStatus[tokenId].isInPool,
                "ape not in single pool"
            );

            // construct staking data
            _nfts[index] = tokenId;

            //emit event
            emit NFTCompounded(nft, tokenId);
        }

        vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
        //claim from ApeCoinStaking
        if (nft == vars.bayc) {
            vars.apeCoinStaking.claimSelfBAYC(_nfts);
            vars.positionCap = vars.baycMatchedCap;
        } else {
            vars.apeCoinStaking.claimSelfMAYC(_nfts);
            vars.positionCap = vars.maycMatchedCap;
        }
        vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
        vars.totalClaimedApe = vars.balanceAfter - vars.balanceBefore;
        IAutoCompoundApe(vars.cApe).deposit(
            address(this),
            vars.totalClaimedApe
        );

        //repay and compound
        (vars.totalRepay, vars.totalCompoundFee) = ApeStakingCommonLogic
            .calculateRepayAndCompound(poolState, vars, vars.positionCap);

        if (vars.totalRepay > 0) {
            IERC20(vars.cApe).safeApprove(vars.pool, vars.totalRepay);
            IPool(vars.pool).repay(vars.cApe, vars.totalRepay, address(this));
        }
        if (vars.totalCompoundFee > 0) {
            cApeShareBalance[address(this)] += vars.totalCompoundFee;
        }
    }

    function compoundBAKC(
        IParaApeStaking.VaultStorage storage vaultStorage,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external {
        uint256 arrayLength = apeTokenIds.length;
        require(
            arrayLength == bakcTokenIds.length && arrayLength > 0,
            "wrong param"
        );

        IParaApeStaking.PoolState storage apePoolState;
        if (nft == vars.bayc) {
            apePoolState = vaultStorage.poolStates[BAYC_SINGLE_POOL_ID];
            vars.apeRewardRatio = vaultStorage.baycPairStakingRewardRatio;
        } else {
            apePoolState = vaultStorage.poolStates[MAYC_SINGLE_POOL_ID];
            vars.apeRewardRatio = vaultStorage.maycPairStakingRewardRatio;
        }
        IParaApeStaking.PoolState storage bakcPoolState = vaultStorage
            .poolStates[BAKC_SINGLE_POOL_ID];

        {
            ApeCoinStaking.PairNft[]
                memory _nftPairs = new ApeCoinStaking.PairNft[](arrayLength);
            for (uint256 index = 0; index < arrayLength; index++) {
                uint32 apeTokenId = apeTokenIds[index];
                uint32 bakcTokenId = bakcTokenIds[index];

                require(
                    apePoolState.tokenStatus[apeTokenId].isInPool,
                    "ape not in single pool"
                );
                require(
                    bakcPoolState.tokenStatus[bakcTokenId].isInPool,
                    "ape not in single pool"
                );

                // construct staking data
                _nftPairs[index] = ApeCoinStaking.PairNft({
                    mainTokenId: apeTokenId,
                    bakcTokenId: bakcTokenId
                });

                //emit event
                emit NFTPairStaked(nft, apeTokenId, bakcTokenId);
            }

            vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
            //claim from ApeCoinStaking
            {
                ApeCoinStaking.PairNft[]
                    memory _otherPairs = new ApeCoinStaking.PairNft[](0);
                if (nft == vars.bayc) {
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
        }

        //repay and compound
        (
            vars.totalRepay,
            vars.totalCompoundFee
        ) = _calculateRepayAndCompoundBAKC(apePoolState, bakcPoolState, vars);

        if (vars.totalRepay > 0) {
            IERC20(vars.cApe).safeApprove(vars.pool, vars.totalRepay);
            IPool(vars.pool).repay(vars.cApe, vars.totalRepay, address(this));
        }
        if (vars.totalCompoundFee > 0) {
            cApeShareBalance[address(this)] += vars.totalCompoundFee;
        }
    }

    function claimNFT(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) external {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, "wrong param");

        _claimNFT(poolState, vars, nft, tokenIds);
    }

    function withdrawNFT(
        IParaApeStaking.VaultStorage storage vaultStorage,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) external {
        console.log("withdrawNFT-----------------------");
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, "wrong param");

        IParaApeStaking.PoolState storage curPoolState;
        address nToken;
        if (nft == vars.bayc) {
            curPoolState = vaultStorage.poolStates[BAYC_SINGLE_POOL_ID];
            nToken = vars.nBayc;
        } else if (nft == vars.mayc) {
            curPoolState = vaultStorage.poolStates[MAYC_SINGLE_POOL_ID];
            nToken = vars.nMayc;
        } else {
            curPoolState = vaultStorage.poolStates[BAKC_SINGLE_POOL_ID];
            nToken = vars.nBakc;
        }

        //claim pending reward
        _claimNFT(curPoolState, vars, nft, tokenIds);

        //update state
        curPoolState.totalPosition -= arrayLength.toUint64();

        if (nft == vars.bayc || nft == vars.mayc) {
            _unstakeApe(vaultStorage, cApeShareBalance, vars, nft, tokenIds);
        } else {
            _unstakeBAKC(vaultStorage, cApeShareBalance, vars, tokenIds);
        }

        //transfer nft back to nToken
        address msgSender = msg.sender;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            address nTokenOwner = IERC721(nToken).ownerOf(tokenId);
            require(msgSender == nTokenOwner, "not owner");

            delete curPoolState.tokenStatus[tokenId];

            IERC721(nft).safeTransferFrom(address(this), nToken, tokenId);

            //emit event
            emit NFTWithdrawn(nft, tokenId);
        }
    }

    function _unstakeApe(
        IParaApeStaking.VaultStorage storage vaultStorage,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) internal {
        uint256 arrayLength = tokenIds.length;

        IParaApeStaking.PoolState storage apePoolState;
        IParaApeStaking.PoolState storage bakcPoolState = vaultStorage
            .poolStates[BAKC_SINGLE_POOL_ID];
        if (nft == vars.bayc) {
            vars.apeStakingPoolId = BAYC_POOL_ID;
            vars.positionCap = vars.baycMatchedCap;
            apePoolState = vaultStorage.poolStates[BAYC_SINGLE_POOL_ID];
            vars.apeRewardRatio = vaultStorage.baycPairStakingRewardRatio;
        } else {
            vars.apeStakingPoolId = MAYC_POOL_ID;
            vars.positionCap = vars.maycMatchedCap;
            apePoolState = vaultStorage.poolStates[MAYC_SINGLE_POOL_ID];
            vars.apeRewardRatio = vaultStorage.maycPairStakingRewardRatio;
        }
        vars._nfts = new ApeCoinStaking.SingleNft[](arrayLength);
        vars._nftPairs = new ApeCoinStaking.PairNftWithdrawWithAmount[](
            arrayLength
        );
        uint64 singleStakingCount;
        uint64 pairStakingCount;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            //check ape position
            {
                (uint256 stakedAmount, ) = vars.apeCoinStaking.nftPosition(
                    vars.apeStakingPoolId,
                    tokenId
                );
                if (stakedAmount > 0) {
                    vars._nfts[singleStakingCount] = ApeCoinStaking.SingleNft({
                        tokenId: tokenId,
                        amount: vars.positionCap.toUint224()
                    });
                    singleStakingCount++;
                }
            }

            //check bakc position
            {
                (uint256 bakcTokenId, bool isPaired) = vars
                    .apeCoinStaking
                    .mainToBakc(vars.apeStakingPoolId, tokenId);
                if (isPaired) {
                    vars._nftPairs[pairStakingCount] = ApeCoinStaking
                        .PairNftWithdrawWithAmount({
                            mainTokenId: tokenId,
                            bakcTokenId: bakcTokenId.toUint32(),
                            amount: vars.bakcMatchedCap.toUint184(),
                            isUncommit: true
                        });
                    pairStakingCount++;
                }
            }
        }

        apePoolState.stakingPosition -= singleStakingCount;
        bakcPoolState.stakingPosition -= pairStakingCount;

        if (singleStakingCount > 0) {
            ApeCoinStaking.SingleNft[] memory _nfts = vars._nfts;
            assembly {
                mstore(_nfts, singleStakingCount)
            }

            vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
            if (nft == vars.bayc) {
                vars.apeCoinStaking.withdrawBAYC(vars._nfts, address(this));
            } else {
                vars.apeCoinStaking.withdrawMAYC(vars._nfts, address(this));
            }
            vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
            vars.totalClaimedApe = vars.balanceAfter - vars.balanceBefore;
            IAutoCompoundApe(vars.cApe).deposit(
                address(this),
                vars.totalClaimedApe
            );

            (vars.totalRepay, vars.totalCompoundFee) = ApeStakingCommonLogic
                .calculateRepayAndCompound(
                    apePoolState,
                    vars,
                    vars.positionCap
                );
        }

        if (pairStakingCount > 0) {
            ApeCoinStaking.PairNftWithdrawWithAmount[] memory _nftPairs = vars
                ._nftPairs;
            assembly {
                mstore(_nftPairs, pairStakingCount)
            }

            vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
            ApeCoinStaking.PairNftWithdrawWithAmount[]
                memory _otherPairs = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                    0
                );
            if (nft == vars.bayc) {
                vars.apeCoinStaking.withdrawBAKC(vars._nftPairs, _otherPairs);
            } else {
                vars.apeCoinStaking.withdrawBAKC(_otherPairs, vars._nftPairs);
            }
            vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
            vars.totalClaimedApe = vars.balanceAfter - vars.balanceBefore;
            IAutoCompoundApe(vars.cApe).deposit(
                address(this),
                vars.totalClaimedApe
            );

            (
                uint256 bakcTotalRepay,
                uint256 bakcCompoundFee
            ) = _calculateRepayAndCompoundBAKC(
                    apePoolState,
                    bakcPoolState,
                    vars
                );
            vars.totalRepay += bakcTotalRepay;
            vars.totalCompoundFee += bakcCompoundFee;
        }

        if (vars.totalRepay > 0) {
            IERC20(vars.cApe).safeApprove(vars.pool, vars.totalRepay);
            IPool(vars.pool).repay(vars.cApe, vars.totalRepay, address(this));
        }
        if (vars.totalCompoundFee > 0) {
            cApeShareBalance[address(this)] += vars.totalCompoundFee;
        }
    }

    function _unstakeBAKC(
        IParaApeStaking.VaultStorage storage vaultStorage,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        uint32[] calldata tokenIds
    ) internal {
        uint256 arrayLength = tokenIds.length;
        ApeCoinStaking.PairNftWithdrawWithAmount[]
            memory baycPair = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                arrayLength
            );
        ApeCoinStaking.PairNftWithdrawWithAmount[]
            memory maycPair = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                arrayLength
            );
        uint64 baycPairCount;
        uint64 maycPairCount;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            (uint256 mainTokenId, bool isPaired) = vars
                .apeCoinStaking
                .bakcToMain(tokenId, BAYC_POOL_ID);
            if (isPaired) {
                baycPair[baycPairCount] = ApeCoinStaking
                    .PairNftWithdrawWithAmount({
                        mainTokenId: mainTokenId.toUint32(),
                        bakcTokenId: tokenId,
                        amount: vars.bakcMatchedCap.toUint184(),
                        isUncommit: true
                    });
                baycPairCount++;
                continue;
            }

            (mainTokenId, isPaired) = vars.apeCoinStaking.bakcToMain(
                tokenId,
                MAYC_POOL_ID
            );
            if (isPaired) {
                maycPair[maycPairCount] = ApeCoinStaking
                    .PairNftWithdrawWithAmount({
                        mainTokenId: mainTokenId.toUint32(),
                        bakcTokenId: tokenId,
                        amount: vars.bakcMatchedCap.toUint184(),
                        isUncommit: true
                    });
                maycPairCount++;
                continue;
            }
        }

        assembly {
            mstore(baycPair, baycPairCount)
        }
        assembly {
            mstore(maycPair, maycPairCount)
        }

        ApeCoinStaking.PairNftWithdrawWithAmount[]
            memory _otherPairs = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                0
            );

        if (baycPairCount > 0) {
            IParaApeStaking.PoolState storage bakcPoolState = vaultStorage
                .poolStates[BAKC_SINGLE_POOL_ID];
            bakcPoolState.stakingPosition -= baycPairCount;

            vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
            vars.apeCoinStaking.withdrawBAKC(baycPair, _otherPairs);
            vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
            vars.totalClaimedApe = vars.balanceAfter - vars.balanceBefore;
            IAutoCompoundApe(vars.cApe).deposit(
                address(this),
                vars.totalClaimedApe
            );

            vars.apeRewardRatio = vaultStorage.baycPairStakingRewardRatio;
            (
                vars.totalRepay,
                vars.totalCompoundFee
            ) = _calculateRepayAndCompoundBAKC(
                vaultStorage.poolStates[BAYC_SINGLE_POOL_ID],
                bakcPoolState,
                vars
            );
        }
        if (maycPairCount > 0) {
            IParaApeStaking.PoolState storage bakcPoolState = vaultStorage
                .poolStates[BAKC_SINGLE_POOL_ID];
            bakcPoolState.stakingPosition -= maycPairCount;

            vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
            vars.apeCoinStaking.withdrawBAKC(baycPair, maycPair);
            vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
            vars.totalClaimedApe = vars.balanceAfter - vars.balanceBefore;
            IAutoCompoundApe(vars.cApe).deposit(
                address(this),
                vars.totalClaimedApe
            );

            vars.apeRewardRatio = vaultStorage.maycPairStakingRewardRatio;
            (
                uint256 maycTotalRepay,
                uint256 maycCompoundFee
            ) = _calculateRepayAndCompoundBAKC(
                    vaultStorage.poolStates[MAYC_SINGLE_POOL_ID],
                    bakcPoolState,
                    vars
                );
            vars.totalRepay += maycTotalRepay;
            vars.totalCompoundFee += maycCompoundFee;
        }

        if (vars.totalRepay > 0) {
            IERC20(vars.cApe).safeApprove(vars.pool, vars.totalRepay);
            IPool(vars.pool).repay(vars.cApe, vars.totalRepay, address(this));
        }
        if (vars.totalCompoundFee > 0) {
            cApeShareBalance[address(this)] += vars.totalCompoundFee;
        }
    }

    function _claimNFT(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) internal {
        vars.accumulatedRewardsPerNft = poolState.accumulatedRewardsPerNft;
        uint256 rewardShares;
        address claimFor;
        uint256 arrayLength = tokenIds.length;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            //just need to check ape ntoken owner
            {
                address nToken = (nft == vars.bayc)
                    ? vars.nBayc
                    : (nft == vars.mayc)
                    ? vars.nMayc
                    : vars.nBakc;
                address nTokenOwner = IERC721(nToken).ownerOf(tokenId);
                if (claimFor == address(0)) {
                    claimFor = nTokenOwner;
                } else {
                    require(
                        nTokenOwner == claimFor,
                        "claim not for same owner"
                    );
                }
            }

            //update reward, to save gas we don't claim pending reward in ApeCoinStaking.
            rewardShares += (vars.accumulatedRewardsPerNft -
                poolState.tokenStatus[tokenId].rewardsDebt);
            poolState.tokenStatus[tokenId].rewardsDebt = vars
                .accumulatedRewardsPerNft;

            //emit event
            emit NFTClaimed(nft, tokenId);
        }

        if (rewardShares > 0) {
            IERC20(vars.cApe).safeTransfer(claimFor, rewardShares);
        }
    }

    function _calculateRepayAndCompoundBAKC(
        IParaApeStaking.PoolState storage apePoolState,
        IParaApeStaking.PoolState storage bakcPoolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars
    ) internal returns (uint256, uint256) {
        uint256 cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
        uint256 latestBorrowIndex = IPool(vars.pool)
            .getReserveNormalizedVariableDebt(vars.cApe);
        uint256 cApeDebtShare = bakcPoolState.cApeDebtShare;
        uint256 debtInterest = ApeStakingCommonLogic
            .calculateCurrentPositionDebtInterest(
                cApeDebtShare,
                bakcPoolState.stakingPosition,
                vars.bakcMatchedCap,
                cApeExchangeRate,
                latestBorrowIndex
            );
        if (debtInterest >= vars.totalClaimedApe) {
            cApeDebtShare -= vars
                .totalClaimedApe
                .rayDiv(latestBorrowIndex)
                .rayDiv(cApeExchangeRate);
            bakcPoolState.cApeDebtShare = cApeDebtShare;
            return (vars.totalClaimedApe, 0);
        } else {
            //repay debt
            cApeDebtShare -= debtInterest.rayDiv(latestBorrowIndex).rayDiv(
                cApeExchangeRate
            );
            bakcPoolState.cApeDebtShare = cApeDebtShare;

            console.log(
                "_calculateRepayAndCompoundBAKC------------vars.totalClaimedApe:",
                vars.totalClaimedApe
            );
            console.log(
                "_calculateRepayAndCompoundBAKC------------debtInterest:",
                debtInterest
            );
            //update reward index
            uint256 shareRewardAmount = (vars.totalClaimedApe - debtInterest)
                .rayDiv(cApeExchangeRate);
            uint256 compoundFee = shareRewardAmount.percentMul(
                vars.compoundFee
            );
            shareRewardAmount = shareRewardAmount - compoundFee;
            uint256 apeShareAmount = shareRewardAmount.percentMul(
                vars.apeRewardRatio
            );

            uint128 apeTotalPosition = apePoolState.totalPosition;
            if (apeTotalPosition != 0) {
                apePoolState.accumulatedRewardsPerNft +=
                    apeShareAmount.toUint128() /
                    apeTotalPosition;
            }
            uint128 bakcTotalPosition = bakcPoolState.totalPosition;
            if (bakcTotalPosition != 0) {
                bakcPoolState.accumulatedRewardsPerNft +=
                    (shareRewardAmount - apeShareAmount).toUint128() /
                    bakcTotalPosition;
            }
            console.log(
                "_calculateRepayAndCompoundBAKC------------vars.compoundFee:",
                vars.compoundFee
            );
            console.log(
                "_calculateRepayAndCompoundBAKC------------compoundFee:",
                compoundFee
            );
            return (debtInterest, compoundFee);
        }
    }
}
