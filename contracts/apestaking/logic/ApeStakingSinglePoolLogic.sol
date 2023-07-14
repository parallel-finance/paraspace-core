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

    uint256 constant BAYC_POOL_ID = 1;
    uint256 constant MAYC_POOL_ID = 2;
    uint256 constant BAKC_POOL_ID = 3;

    event NFTDeposited(address nft, uint256 tokenId);
    event ApeStaked(bool isBAYC, uint256 tokenId);
    event BakcStaked(bool isBAYC, uint256 apeTokenId, uint256 bakcTokenId);
    event ApeCompounded(bool isBAYC, uint256 tokenId);
    event BakcCompounded(bool isBAYC, uint256 apeTokenId, uint256 bakcTokenId);
    event NFTClaimed(address nft, uint256 tokenId);
    event NFTWithdrawn(address nft, uint256 tokenId);

    function depositNFT(
        IParaApeStaking.VaultStorage storage vaultStorage,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) external {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, Errors.INVALID_PARAMETER);

        address msgSender = msg.sender;
        address nToken = (nft == vars.bayc) ? vars.nBayc : (nft == vars.mayc)
            ? vars.nMayc
            : vars.nBakc;
        uint128 accumulatedRewardsPerNft = _getPoolAccumulatedRewardsPerNft(
            vaultStorage,
            vars,
            nft
        );
        mapping(uint256 => IParaApeStaking.TokenStatus)
            storage tokenStatus = _getPoolTokenStatus(vaultStorage, vars, nft);

        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            address nTokenOwner = IERC721(nToken).ownerOf(tokenId);
            require(msgSender == nTokenOwner, Errors.NOT_THE_OWNER);

            if (nft == vars.bakc) {
                (uint256 stakedAmount, ) = vars.apeCoinStaking.nftPosition(
                    BAKC_POOL_ID,
                    tokenId
                );
                require(stakedAmount == 0, Errors.APE_POSITION_EXISTED);
            } else {
                vars.apeStakingPoolId = (nft == vars.bayc)
                    ? BAYC_POOL_ID
                    : MAYC_POOL_ID;

                (uint256 stakedAmount, ) = vars.apeCoinStaking.nftPosition(
                    vars.apeStakingPoolId,
                    tokenId
                );
                require(stakedAmount == 0, Errors.APE_POSITION_EXISTED);

                (, bool isPaired) = vars.apeCoinStaking.mainToBakc(
                    vars.apeStakingPoolId,
                    tokenId
                );
                require(!isPaired, Errors.PAIR_POSITION_EXISTED);
            }

            IERC721(nft).safeTransferFrom(nToken, address(this), tokenId);

            //update token status
            tokenStatus[tokenId] = IApeStakingVault.TokenStatus({
                rewardsDebt: accumulatedRewardsPerNft,
                isInPool: true
            });

            //emit event
            emit NFTDeposited(nft, tokenId);
        }

        if (nft == vars.bayc) {
            vaultStorage
                .poolStates[BAYC_SINGLE_POOL_ID]
                .totalPosition += arrayLength.toUint32();
        } else if (nft == vars.mayc) {
            vaultStorage
                .poolStates[MAYC_SINGLE_POOL_ID]
                .totalPosition += arrayLength.toUint32();
        } else {
            vaultStorage.bakcPoolState.totalPosition += arrayLength.toUint32();
        }
    }

    function stakingApe(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata tokenIds
    ) external {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, Errors.INVALID_PARAMETER);

        ApeCoinStaking.SingleNft[]
            memory _nfts = new ApeCoinStaking.SingleNft[](arrayLength);
        uint256 positionCap = isBAYC
            ? vars.baycMatchedCap
            : vars.maycMatchedCap;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            require(
                poolState.tokenStatus[tokenId].isInPool,
                Errors.NFT_NOT_IN_SINGLE_POOL
            );

            // construct staking data
            _nfts[index] = ApeCoinStaking.SingleNft({
                tokenId: tokenId,
                amount: positionCap.toUint224()
            });

            //emit event
            emit ApeStaked(isBAYC, tokenId);
        }

        // prepare Ape coin
        uint256 totalBorrow = positionCap * arrayLength;
        uint256 cApeDebtShare = ApeStakingCommonLogic.borrowCApeFromPool(
            vars,
            totalBorrow
        );
        poolState.cApeDebtShare += cApeDebtShare.toUint128();

        //stake in ApeCoinStaking
        if (isBAYC) {
            vars.apeCoinStaking.depositBAYC(_nfts);
        } else {
            vars.apeCoinStaking.depositMAYC(_nfts);
        }

        poolState.stakingPosition += arrayLength.toUint32();
    }

    function stakingBAKC(
        IParaApeStaking.PoolState storage apePoolState,
        IParaApeStaking.BAKCPoolState storage bakcPoolState,
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

        ApeCoinStaking.PairNftDepositWithAmount[]
            memory _nftPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                arrayLength
            );
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 apeTokenId = apeTokenIds[index];
            uint32 bakcTokenId = bakcTokenIds[index];

            require(
                apePoolState.tokenStatus[apeTokenId].isInPool,
                Errors.NFT_NOT_IN_SINGLE_POOL
            );
            require(
                bakcPoolState.tokenStatus[bakcTokenId].isInPool,
                Errors.NFT_NOT_IN_SINGLE_POOL
            );

            // construct staking data
            _nftPairs[index] = ApeCoinStaking.PairNftDepositWithAmount({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId,
                amount: vars.bakcMatchedCap.toUint184()
            });

            //emit event
            emit BakcStaked(isBAYC, apeTokenId, bakcTokenId);
        }

        // prepare Ape coin
        uint256 totalBorrow = vars.bakcMatchedCap * arrayLength;
        uint256 cApeDebtShare = ApeStakingCommonLogic.borrowCApeFromPool(
            vars,
            totalBorrow
        );

        //stake in ApeCoinStaking
        ApeCoinStaking.PairNftDepositWithAmount[]
            memory _otherPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                0
            );
        if (isBAYC) {
            vars.apeCoinStaking.depositBAKC(_nftPairs, _otherPairs);
            bakcPoolState.baycStakingPosition += arrayLength.toUint32();
            bakcPoolState.baycCApeDebtShare += cApeDebtShare.toUint128();
        } else {
            vars.apeCoinStaking.depositBAKC(_otherPairs, _nftPairs);
            bakcPoolState.maycStakingPosition += arrayLength.toUint32();
            bakcPoolState.maycCApeDebtShare += cApeDebtShare.toUint128();
        }
    }

    function compoundApe(
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
                Errors.NFT_NOT_IN_SINGLE_POOL
            );

            // construct staking data
            _nfts[index] = tokenId;

            //emit event
            emit ApeCompounded(isBAYC, tokenId);
        }

        vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
        //claim from ApeCoinStaking
        if (isBAYC) {
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
        vars.cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
        vars.latestBorrowIndex = IPool(vars.pool)
            .getReserveNormalizedVariableDebt(vars.cApe);
        (vars.totalRepay, vars.totalCompoundFee) = ApeStakingCommonLogic
            .calculateRepayAndCompound(poolState, vars, vars.positionCap);

        if (vars.totalRepay > 0) {
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
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external {
        uint256 arrayLength = apeTokenIds.length;
        require(
            arrayLength == bakcTokenIds.length && arrayLength > 0,
            Errors.INVALID_PARAMETER
        );

        IParaApeStaking.PoolState storage apePoolState;
        if (isBAYC) {
            apePoolState = vaultStorage.poolStates[BAYC_SINGLE_POOL_ID];
            vars.apeRewardRatio = vaultStorage.baycPairStakingRewardRatio;
        } else {
            apePoolState = vaultStorage.poolStates[MAYC_SINGLE_POOL_ID];
            vars.apeRewardRatio = vaultStorage.maycPairStakingRewardRatio;
        }
        IParaApeStaking.BAKCPoolState storage bakcPoolState = vaultStorage
            .bakcPoolState;

        {
            ApeCoinStaking.PairNft[]
                memory _nftPairs = new ApeCoinStaking.PairNft[](arrayLength);
            for (uint256 index = 0; index < arrayLength; index++) {
                uint32 apeTokenId = apeTokenIds[index];
                uint32 bakcTokenId = bakcTokenIds[index];

                // we just need to check bakc is in the pool
                require(
                    bakcPoolState.tokenStatus[bakcTokenId].isInPool,
                    Errors.NFT_NOT_IN_SINGLE_POOL
                );

                // construct staking data
                _nftPairs[index] = ApeCoinStaking.PairNft({
                    mainTokenId: apeTokenId,
                    bakcTokenId: bakcTokenId
                });

                //emit event
                emit BakcCompounded(isBAYC, apeTokenId, bakcTokenId);
            }

            vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
            //claim from ApeCoinStaking
            ApeCoinStaking.PairNft[]
                memory _otherPairs = new ApeCoinStaking.PairNft[](0);
            if (isBAYC) {
                vars.apeCoinStaking.claimSelfBAKC(_nftPairs, _otherPairs);
            } else {
                vars.apeCoinStaking.claimSelfBAKC(_otherPairs, _nftPairs);
            }
            vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
            vars.totalClaimedApe = vars.balanceAfter - vars.balanceBefore;
            IAutoCompoundApe(vars.cApe).deposit(
                address(this),
                vars.totalClaimedApe
            );
        }

        //repay and compound
        vars.cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
        vars.latestBorrowIndex = IPool(vars.pool)
            .getReserveNormalizedVariableDebt(vars.cApe);
        (
            vars.totalRepay,
            vars.totalCompoundFee
        ) = _calculateRepayAndCompoundBAKC(
            apePoolState,
            bakcPoolState,
            vars,
            isBAYC
        );

        if (vars.totalRepay > 0) {
            IPool(vars.pool).repay(vars.cApe, vars.totalRepay, address(this));
        }
        if (vars.totalCompoundFee > 0) {
            cApeShareBalance[address(this)] += vars.totalCompoundFee;
        }
    }

    function claimNFT(
        IParaApeStaking.VaultStorage storage vaultStorage,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) external {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, Errors.INVALID_PARAMETER);

        vars.accumulatedRewardsPerNft = _getPoolAccumulatedRewardsPerNft(
            vaultStorage,
            vars,
            nft
        );
        mapping(uint256 => IParaApeStaking.TokenStatus)
            storage tokenStatus = _getPoolTokenStatus(vaultStorage, vars, nft);

        _claimNFT(tokenStatus, vars, nft, tokenIds);
    }

    function withdrawNFT(
        IParaApeStaking.VaultStorage storage vaultStorage,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) external {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, Errors.INVALID_PARAMETER);

        vars.accumulatedRewardsPerNft = _getPoolAccumulatedRewardsPerNft(
            vaultStorage,
            vars,
            nft
        );
        mapping(uint256 => IParaApeStaking.TokenStatus)
            storage tokenStatus = _getPoolTokenStatus(vaultStorage, vars, nft);

        //claim pending reward
        _claimNFT(tokenStatus, vars, nft, tokenIds);

        address nToken;
        if (nft == vars.bayc) {
            _unstakeApe(vaultStorage, cApeShareBalance, vars, true, tokenIds);
            nToken = vars.nBayc;
        } else if (nft == vars.mayc) {
            _unstakeApe(vaultStorage, cApeShareBalance, vars, false, tokenIds);
            nToken = vars.nMayc;
        } else {
            _unstakeBAKC(vaultStorage, cApeShareBalance, vars, tokenIds);
            nToken = vars.nBakc;
        }

        //transfer nft back to nToken
        address msgSender = msg.sender;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            address nTokenOwner = IERC721(nToken).ownerOf(tokenId);
            require(msgSender == nTokenOwner, Errors.NOT_THE_OWNER);

            delete tokenStatus[tokenId];

            IERC721(nft).safeTransferFrom(address(this), nToken, tokenId);

            //emit event
            emit NFTWithdrawn(nft, tokenId);
        }
    }

    function _unstakeApe(
        IParaApeStaking.VaultStorage storage vaultStorage,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata tokenIds
    ) internal {
        IParaApeStaking.PoolState storage apePoolState;
        if (isBAYC) {
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

        apePoolState.totalPosition -= tokenIds.length.toUint32();

        ApeCoinStaking.SingleNft[]
            memory _nfts = new ApeCoinStaking.SingleNft[](tokenIds.length);
        ApeCoinStaking.PairNftWithdrawWithAmount[]
            memory _nftPairs = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                tokenIds.length
            );
        uint32 singleStakingCount;
        uint32 pairStakingCount;
        for (uint256 index = 0; index < tokenIds.length; index++) {
            uint32 tokenId = tokenIds[index];

            //check ape position
            {
                (uint256 stakedAmount, ) = vars.apeCoinStaking.nftPosition(
                    vars.apeStakingPoolId,
                    tokenId
                );
                if (stakedAmount > 0) {
                    _nfts[singleStakingCount] = ApeCoinStaking.SingleNft({
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
                    _nftPairs[pairStakingCount] = ApeCoinStaking
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
        IParaApeStaking.BAKCPoolState storage bakcPoolState = vaultStorage
            .bakcPoolState;
        if (isBAYC) {
            bakcPoolState.baycStakingPosition -= pairStakingCount;
        } else {
            bakcPoolState.maycStakingPosition -= pairStakingCount;
        }

        vars.cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
        vars.latestBorrowIndex = IPool(vars.pool)
            .getReserveNormalizedVariableDebt(vars.cApe);
        if (singleStakingCount > 0) {
            assembly {
                mstore(_nfts, singleStakingCount)
            }

            vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
            if (isBAYC) {
                vars.apeCoinStaking.withdrawBAYC(_nfts, address(this));
            } else {
                vars.apeCoinStaking.withdrawMAYC(_nfts, address(this));
            }
            vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
            vars.totalClaimedApe = vars.balanceAfter - vars.balanceBefore;
            if (vars.totalClaimedApe > 0) {
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
        }

        if (pairStakingCount > 0) {
            assembly {
                mstore(_nftPairs, pairStakingCount)
            }

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
            if (vars.totalClaimedApe > 0) {
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
                        vars,
                        isBAYC
                    );
                vars.totalRepay += bakcTotalRepay;
                vars.totalCompoundFee += bakcCompoundFee;
            }
        }

        if (vars.totalRepay > 0) {
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
        IParaApeStaking.BAKCPoolState storage bakcPoolState = vaultStorage
            .bakcPoolState;
        vaultStorage.bakcPoolState.totalPosition -= arrayLength.toUint32();
        ApeCoinStaking.PairNftWithdrawWithAmount[]
            memory baycPair = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                arrayLength
            );
        ApeCoinStaking.PairNftWithdrawWithAmount[]
            memory maycPair = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                arrayLength
            );
        uint32 baycPairCount;
        uint32 maycPairCount;
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
        vars.cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
        vars.latestBorrowIndex = IPool(vars.pool)
            .getReserveNormalizedVariableDebt(vars.cApe);
        if (baycPairCount > 0) {
            bakcPoolState.baycStakingPosition -= baycPairCount;

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
                vars,
                true
            );
        }
        if (maycPairCount > 0) {
            bakcPoolState.maycStakingPosition -= maycPairCount;

            vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
            vars.apeCoinStaking.withdrawBAKC(_otherPairs, maycPair);
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
                    vars,
                    false
                );
            vars.totalRepay += maycTotalRepay;
            vars.totalCompoundFee += maycCompoundFee;
        }

        if (vars.totalRepay > 0) {
            IPool(vars.pool).repay(vars.cApe, vars.totalRepay, address(this));
        }
        if (vars.totalCompoundFee > 0) {
            cApeShareBalance[address(this)] += vars.totalCompoundFee;
        }
    }

    function calculatePendingReward(
        IParaApeStaking.VaultStorage storage vaultStorage,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) external view returns (uint256) {
        vars.accumulatedRewardsPerNft = _getPoolAccumulatedRewardsPerNft(
            vaultStorage,
            vars,
            nft
        );
        mapping(uint256 => IParaApeStaking.TokenStatus)
            storage tokenStatus = _getPoolTokenStatus(vaultStorage, vars, nft);

        address nToken = (nft == vars.bayc) ? vars.nBayc : (nft == vars.mayc)
            ? vars.nMayc
            : vars.nBakc;

        (, uint256 pendingReward) = _calculatePendingReward(
            tokenStatus,
            vars,
            nToken,
            tokenIds
        );
        return pendingReward;
    }

    function _calculatePendingReward(
        mapping(uint256 => IParaApeStaking.TokenStatus) storage tokenStatus,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nToken,
        uint32[] calldata tokenIds
    ) internal view returns (address claimFor, uint256 pendingReward) {
        uint256 rewardShares;
        uint256 arrayLength = tokenIds.length;
        uint128 accumulatedRewardsPerNft = vars.accumulatedRewardsPerNft;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            //just need to check ape ntoken owner
            {
                address nTokenOwner = IERC721(nToken).ownerOf(tokenId);
                if (claimFor == address(0)) {
                    claimFor = nTokenOwner;
                } else {
                    require(nTokenOwner == claimFor, Errors.NOT_THE_SAME_OWNER);
                }
            }

            require(
                tokenStatus[tokenId].isInPool,
                Errors.NFT_NOT_IN_SINGLE_POOL
            );

            //update reward, to save gas we don't claim pending reward in ApeCoinStaking.
            rewardShares += (accumulatedRewardsPerNft -
                tokenStatus[tokenId].rewardsDebt);
        }
        pendingReward = ICApe(vars.cApe).getPooledApeByShares(rewardShares);

        return (claimFor, pendingReward);
    }

    function _claimNFT(
        mapping(uint256 => IParaApeStaking.TokenStatus) storage tokenStatus,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) internal {
        address nToken = (nft == vars.bayc) ? vars.nBayc : (nft == vars.mayc)
            ? vars.nMayc
            : vars.nBakc;
        (address owner, uint256 pendingReward) = _calculatePendingReward(
            tokenStatus,
            vars,
            nToken,
            tokenIds
        );

        if (pendingReward > 0) {
            uint256 arrayLength = tokenIds.length;
            for (uint256 index = 0; index < arrayLength; index++) {
                uint32 tokenId = tokenIds[index];

                tokenStatus[tokenId].rewardsDebt = vars
                    .accumulatedRewardsPerNft;

                //emit event
                emit NFTClaimed(nft, tokenId);
            }

            IERC20(vars.cApe).safeTransfer(owner, pendingReward);
        }
    }

    function _calculateRepayAndCompoundBAKC(
        IParaApeStaking.PoolState storage apePoolState,
        IParaApeStaking.BAKCPoolState storage bakcPoolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC
    ) internal returns (uint256, uint256) {
        uint256 repayAmount = 0;
        uint256 debtInterest = 0;
        //calculate repay
        uint256 cApeDebtShare;
        uint256 stakingPosition;
        if (isBAYC) {
            cApeDebtShare = bakcPoolState.baycCApeDebtShare;
            stakingPosition = bakcPoolState.baycStakingPosition;
        } else {
            cApeDebtShare = bakcPoolState.maycCApeDebtShare;
            stakingPosition = bakcPoolState.maycStakingPosition;
        }
        debtInterest = ApeStakingCommonLogic
            .calculateCurrentPositionDebtInterest(
                cApeDebtShare,
                stakingPosition,
                vars.bakcMatchedCap,
                vars.cApeExchangeRate,
                vars.latestBorrowIndex
            );
        repayAmount = (debtInterest >= vars.totalClaimedApe)
            ? vars.totalClaimedApe
            : debtInterest;
        cApeDebtShare -= repayAmount.rayDiv(vars.latestBorrowIndex).rayDiv(
            vars.cApeExchangeRate
        );
        if (isBAYC) {
            bakcPoolState.baycCApeDebtShare = cApeDebtShare.toUint128();
        } else {
            bakcPoolState.maycCApeDebtShare = cApeDebtShare.toUint128();
        }

        //calculate compound fee
        uint256 compoundFee = 0;
        if (vars.totalClaimedApe > debtInterest) {
            //update reward index
            uint256 shareRewardAmount = (vars.totalClaimedApe - debtInterest)
                .rayDiv(vars.cApeExchangeRate);
            compoundFee = shareRewardAmount.percentMul(vars.compoundFee);
            shareRewardAmount = shareRewardAmount - compoundFee;
            uint256 apeShareAmount = shareRewardAmount.percentMul(
                vars.apeRewardRatio
            );

            uint128 apeTotalPosition = apePoolState.totalPosition;
            if (apeTotalPosition != 0) {
                apePoolState.accumulatedRewardsPerNft +=
                    apeShareAmount.toUint128() /
                    apeTotalPosition;
            } else {
                compoundFee += apeShareAmount;
            }
            uint128 bakcTotalPosition = bakcPoolState.totalPosition;
            if (bakcTotalPosition != 0) {
                bakcPoolState.accumulatedRewardsPerNft +=
                    (shareRewardAmount - apeShareAmount).toUint128() /
                    bakcTotalPosition;
            } else {
                compoundFee += (shareRewardAmount - apeShareAmount);
            }
        }

        return (repayAmount, compoundFee);
    }

    function _getPoolAccumulatedRewardsPerNft(
        IParaApeStaking.VaultStorage storage vaultStorage,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft
    ) internal view returns (uint128) {
        return
            (nft == vars.bakc)
                ? vaultStorage.bakcPoolState.accumulatedRewardsPerNft
                : (nft == vars.bayc)
                ? vaultStorage
                    .poolStates[BAYC_SINGLE_POOL_ID]
                    .accumulatedRewardsPerNft
                : vaultStorage
                    .poolStates[MAYC_SINGLE_POOL_ID]
                    .accumulatedRewardsPerNft;
    }

    function _getPoolTokenStatus(
        IParaApeStaking.VaultStorage storage vaultStorage,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft
    )
        internal
        view
        returns (mapping(uint256 => IParaApeStaking.TokenStatus) storage)
    {
        return
            (nft == vars.bakc)
                ? vaultStorage.bakcPoolState.tokenStatus
                : (nft == vars.bayc)
                ? vaultStorage.poolStates[BAYC_SINGLE_POOL_ID].tokenStatus
                : vaultStorage.poolStates[MAYC_SINGLE_POOL_ID].tokenStatus;
    }
}
