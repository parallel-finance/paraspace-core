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

/**
 * @title ApeStakingVaultLogic library
 *
 * @notice Implements the base logic for ape staking vault
 */
library ApeStakingVaultLogic {
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

    event NFTDeposited(address nft, uint256 tokenId);
    event NFTStaked(address nft, uint256 tokenId);
    event NFTPairStaked(address nft, uint256 apeTokenId, uint256 bakcTokenId);
    event NFTCompounded(address nft, uint256 tokenId);
    event NFTClaimed(address nft, uint256 tokenId);
    event NFTWithdrawn(address nft, uint256 tokenId);

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
        _borrowCApeFromPool(poolState, vars, totalBorrow);

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

            uint256 totalRepay = _reayAndCompound(
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
        uint256 totalRepay = _reayAndCompound(
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

        poolState.totalPosition += arrayLength.toUint128();
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
        _borrowCApeFromPool(poolState, vars, totalBorrow);

        //stake in ApeCoinStaking
        if (nft == vars.bayc) {
            vars.apeCoinStaking.depositBAYC(_nfts);
        } else {
            vars.apeCoinStaking.depositMAYC(_nfts);
        }
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
        _borrowCApeFromPool(bakcPoolState, vars, totalBorrow);

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
    }

    function compoundApe(
        IParaApeStaking.PoolState storage poolState,
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
        uint256 balanceDiff = vars.balanceAfter - vars.balanceBefore;
        IAutoCompoundApe(vars.cApe).deposit(address(this), balanceDiff);

        //repay and compound
        uint256 totalRepay = _reayAndCompound(
            poolState,
            vars,
            balanceDiff,
            vars.positionCap
        );

        if (totalRepay > 0) {
            IERC20(vars.cApe).safeApprove(vars.pool, totalRepay);
            IPool(vars.pool).repay(vars.cApe, totalRepay, address(this));
        }
    }

    function compoundBAKC(
        IParaApeStaking.VaultStorage storage vaultStorage,
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
            apePoolState = vaultStorage.poolStates[
                ApeStakingVaultLogic.BAYC_SINGLE_POOL_ID
            ];
            vars.apeRewardRatio = vaultStorage.baycPairStakingRewardRatio;
        } else {
            apePoolState = vaultStorage.poolStates[
                ApeStakingVaultLogic.MAYC_SINGLE_POOL_ID
            ];
            vars.apeRewardRatio = vaultStorage.maycPairStakingRewardRatio;
        }
        IParaApeStaking.PoolState storage bakcPoolState = vaultStorage
            .poolStates[BAKC_SINGLE_POOL_ID];

        uint256 totalReward;
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
            totalReward = vars.balanceAfter - vars.balanceBefore;
            IAutoCompoundApe(vars.cApe).deposit(address(this), totalReward);
        }

        //repay and compound
        uint256 totalRepay = _reayAndCompoundBAKC(
            apePoolState,
            bakcPoolState,
            vars,
            totalReward
        );

        if (totalRepay > 0) {
            IERC20(vars.cApe).safeApprove(vars.pool, totalRepay);
            IPool(vars.pool).repay(vars.cApe, totalRepay, address(this));
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
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) external {
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
        curPoolState.totalPosition -= arrayLength.toUint128();

        if (nft == vars.bayc || nft == vars.mayc) {
            _unstakeApe(vaultStorage, vars, nft, tokenIds);
        } else {
            _unstakeBAKC(vaultStorage, vars, tokenIds);
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
        uint256 singleStakingCount;
        uint256 pairStakingCount;
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

        uint256 totalRepay = 0;
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
            uint256 balanceDiff = vars.balanceAfter - vars.balanceBefore;
            IAutoCompoundApe(vars.cApe).deposit(address(this), balanceDiff);

            totalRepay += _reayAndCompound(
                apePoolState,
                vars,
                balanceDiff,
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
            uint256 balanceDiff = vars.balanceAfter - vars.balanceBefore;
            IAutoCompoundApe(vars.cApe).deposit(address(this), balanceDiff);

            totalRepay += _reayAndCompoundBAKC(
                apePoolState,
                bakcPoolState,
                vars,
                balanceDiff
            );
        }

        if (totalRepay > 0) {
            IERC20(vars.cApe).safeApprove(vars.pool, totalRepay);
            IPool(vars.pool).repay(vars.cApe, totalRepay, address(this));
        }
    }

    function _unstakeBAKC(
        IParaApeStaking.VaultStorage storage vaultStorage,
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
        uint256 baycPairCount;
        uint256 maycPairCount;
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

        uint256 totalRepay = 0;
        if (baycPairCount > 0) {
            vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
            vars.apeCoinStaking.withdrawBAKC(baycPair, _otherPairs);
            vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
            uint256 balanceDiff = vars.balanceAfter - vars.balanceBefore;
            IAutoCompoundApe(vars.cApe).deposit(address(this), balanceDiff);

            vars.apeRewardRatio = vaultStorage.baycPairStakingRewardRatio;
            totalRepay += _reayAndCompoundBAKC(
                vaultStorage.poolStates[BAYC_SINGLE_POOL_ID],
                vaultStorage.poolStates[BAKC_SINGLE_POOL_ID],
                vars,
                balanceDiff
            );
        }
        if (maycPairCount > 0) {
            vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
            vars.apeCoinStaking.withdrawBAKC(baycPair, maycPair);
            vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
            uint256 balanceDiff = vars.balanceAfter - vars.balanceBefore;
            IAutoCompoundApe(vars.cApe).deposit(address(this), balanceDiff);

            vars.apeRewardRatio = vaultStorage.maycPairStakingRewardRatio;
            totalRepay += _reayAndCompoundBAKC(
                vaultStorage.poolStates[MAYC_SINGLE_POOL_ID],
                vaultStorage.poolStates[BAKC_SINGLE_POOL_ID],
                vars,
                balanceDiff
            );
        }

        if (totalRepay > 0) {
            IERC20(vars.cApe).safeApprove(vars.pool, totalRepay);
            IPool(vars.pool).repay(vars.cApe, totalRepay, address(this));
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

    function _reayAndCompound(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        uint256 totalAmount,
        uint256 positionCap
    ) internal returns (uint256) {
        uint256 cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
        uint256 latestBorrowIndex = IPool(vars.pool)
            .getReserveNormalizedVariableDebt(vars.cApe);
        uint256 cApeDebtShare = poolState.cApeDebtShare;
        uint128 currentTotalPosition = poolState.totalPosition;
        uint256 debtInterest = _calculateCurrentPositionDebtInterest(
            cApeDebtShare,
            currentTotalPosition,
            positionCap,
            cApeExchangeRate,
            latestBorrowIndex
        );
        if (debtInterest >= totalAmount) {
            cApeDebtShare -= totalAmount.rayDiv(latestBorrowIndex).rayDiv(
                cApeExchangeRate
            );
            poolState.cApeDebtShare = cApeDebtShare;
            return totalAmount;
        } else {
            //repay debt
            cApeDebtShare -= debtInterest.rayDiv(latestBorrowIndex).rayDiv(
                cApeExchangeRate
            );

            //update reward index
            if (currentTotalPosition != 0) {
                uint256 remainingReward = totalAmount - debtInterest;
                uint256 shareAmount = remainingReward.rayDiv(cApeExchangeRate);
                poolState.accumulatedRewardsPerNft +=
                    shareAmount.toUint128() /
                    currentTotalPosition;
            }
            poolState.cApeDebtShare = cApeDebtShare;
            return debtInterest;
        }
    }

    function _reayAndCompoundBAKC(
        IParaApeStaking.PoolState storage apePoolState,
        IParaApeStaking.PoolState storage bakcPoolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        uint256 totalAmount
    ) internal returns (uint256) {
        uint256 cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
        uint256 latestBorrowIndex = IPool(vars.pool)
            .getReserveNormalizedVariableDebt(vars.cApe);
        uint256 cApeDebtShare = bakcPoolState.cApeDebtShare;
        uint128 apeTotalPosition = apePoolState.totalPosition;
        uint128 bakcTotalPosition = bakcPoolState.totalPosition;
        uint256 debtInterest = _calculateCurrentPositionDebtInterest(
            cApeDebtShare,
            bakcTotalPosition,
            vars.bakcMatchedCap,
            cApeExchangeRate,
            latestBorrowIndex
        );
        if (debtInterest >= totalAmount) {
            cApeDebtShare -= totalAmount.rayDiv(latestBorrowIndex).rayDiv(
                cApeExchangeRate
            );
            bakcPoolState.cApeDebtShare = cApeDebtShare;
            return totalAmount;
        } else {
            //repay debt
            cApeDebtShare -= debtInterest.rayDiv(latestBorrowIndex).rayDiv(
                cApeExchangeRate
            );

            //update reward index
            uint256 remainingReward = totalAmount - debtInterest;
            uint256 shareAmount = remainingReward.rayDiv(cApeExchangeRate);
            uint256 apeShareAmount = shareAmount.percentMul(
                vars.apeRewardRatio
            );

            if (apeTotalPosition != 0) {
                apePoolState.accumulatedRewardsPerNft +=
                    apeShareAmount.toUint128() /
                    apeTotalPosition;
            }
            if (bakcTotalPosition != 0) {
                bakcPoolState.accumulatedRewardsPerNft +=
                    (shareAmount - apeShareAmount).toUint128() /
                    bakcTotalPosition;
            }
            bakcPoolState.cApeDebtShare = cApeDebtShare;
            return debtInterest;
        }
    }

    function _calculateCurrentPositionDebtInterest(
        uint256 cApeDebtShare,
        uint256 totalPosition,
        uint256 perPositionCap,
        uint256 cApeExchangeRate,
        uint256 latestBorrowIndex
    ) internal pure returns (uint256) {
        uint256 currentDebt = cApeDebtShare.rayMul(cApeExchangeRate).rayMul(
            latestBorrowIndex
        );
        return (currentDebt - perPositionCap * totalPosition);
    }

    function _borrowCApeFromPool(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        uint256 totalBorrow
    ) internal {
        uint256 latestBorrowIndex = IPool(vars.pool).borrowPoolCApe(
            totalBorrow
        );
        IAutoCompoundApe(vars.cApe).withdraw(totalBorrow);
        uint256 cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
        poolState.cApeDebtShare += totalBorrow.rayDiv(latestBorrowIndex).rayDiv(
            cApeExchangeRate
        );
    }
}
