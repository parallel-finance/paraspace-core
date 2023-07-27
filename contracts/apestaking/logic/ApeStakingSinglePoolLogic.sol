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

    event NFTDeposited(address nft, uint256 tokenId);
    event ApeStaked(bool isBAYC, uint256 tokenId);
    event BakcStaked(bool isBAYC, uint256 apeTokenId, uint256 bakcTokenId);
    event ApeCompounded(bool isBAYC, uint256 tokenId);
    event BakcCompounded(bool isBAYC, uint256 apeTokenId, uint256 bakcTokenId);
    event NFTClaimed(address nft, uint256 tokenId);
    event NFTWithdrawn(address nft, uint256 tokenId);

    function depositNFT(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) external {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, Errors.INVALID_PARAMETER);

        address nToken;
        uint256 apeStakingPoolId;
        if (nft == vars.bayc) {
            nToken = vars.nBayc;
            apeStakingPoolId = ApeStakingCommonLogic.BAYC_POOL_ID;
        } else if (nft == vars.mayc) {
            nToken = vars.nMayc;
            apeStakingPoolId = ApeStakingCommonLogic.MAYC_POOL_ID;
        } else {
            nToken = vars.nBakc;
            apeStakingPoolId = ApeStakingCommonLogic.BAKC_POOL_ID;
        }
        address msgSender = msg.sender;
        uint128 accumulatedRewardsPerNft = poolState.accumulatedRewardsPerNft;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            require(
                msgSender == IERC721(nToken).ownerOf(tokenId),
                Errors.NOT_THE_OWNER
            );

            (uint256 stakedAmount, ) = vars.apeCoinStaking.nftPosition(
                apeStakingPoolId,
                tokenId
            );
            require(stakedAmount == 0, Errors.APE_POSITION_EXISTED);
            if (nft != vars.bakc) {
                (, bool isPaired) = vars.apeCoinStaking.mainToBakc(
                    apeStakingPoolId,
                    tokenId
                );
                require(!isPaired, Errors.PAIR_POSITION_EXISTED);
            }

            IERC721(nft).safeTransferFrom(nToken, address(this), tokenId);

            //update token status
            poolState.tokenStatus[tokenId] = IParaApeStaking.TokenStatus({
                rewardsDebt: accumulatedRewardsPerNft,
                isInPool: true,
                bakcTokenId: 0,
                isPaired: false
            });

            //emit event
            emit NFTDeposited(nft, tokenId);
        }

        //update state
        poolState.totalPosition += arrayLength.toUint24();
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
                Errors.NFT_NOT_IN_POOL
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
        poolState.cApeDebtShare += cApeDebtShare.toUint104();

        //stake in ApeCoinStaking
        if (isBAYC) {
            vars.apeCoinStaking.depositBAYC(_nfts);
        } else {
            vars.apeCoinStaking.depositMAYC(_nfts);
        }

        poolState.stakingPosition += arrayLength.toUint24();
    }

    function stakingBAKC(
        mapping(uint256 => IParaApeStaking.PoolState) storage poolStates,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        IParaApeStaking.BAKCPairActionInfo calldata actionInfo
    ) external {
        _validateBAKCPairActionInfo(actionInfo);
        uint256 baycArrayLength = actionInfo.baycTokenIds.length;
        uint256 maycArrayLength = actionInfo.maycTokenIds.length;

        ApeCoinStaking.PairNftDepositWithAmount[]
            memory _baycPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                baycArrayLength
            );
        ApeCoinStaking.PairNftDepositWithAmount[]
            memory _maycPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                maycArrayLength
            );
        IParaApeStaking.PoolState storage bakcPoolState = poolStates[
            ApeStakingCommonLogic.BAKC_SINGLE_POOL_ID
        ];
        for (uint256 index = 0; index < baycArrayLength; index++) {
            uint32 apeTokenId = actionInfo.baycTokenIds[index];
            uint32 bakcTokenId = actionInfo.bakcPairBaycTokenIds[index];

            IParaApeStaking.PoolState storage baycPoolState = poolStates[
                ApeStakingCommonLogic.BAYC_SINGLE_POOL_ID
            ];

            require(
                baycPoolState.tokenStatus[apeTokenId].isInPool,
                Errors.NFT_NOT_IN_POOL
            );
            require(
                bakcPoolState.tokenStatus[bakcTokenId].isInPool,
                Errors.NFT_NOT_IN_POOL
            );

            // construct staking data
            _baycPairs[index] = ApeCoinStaking.PairNftDepositWithAmount({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId,
                amount: vars.bakcMatchedCap.toUint184()
            });

            //emit event
            emit BakcStaked(true, apeTokenId, bakcTokenId);
        }

        for (uint256 index = 0; index < maycArrayLength; index++) {
            uint32 apeTokenId = actionInfo.maycTokenIds[index];
            uint32 bakcTokenId = actionInfo.bakcPairMaycTokenIds[index];

            IParaApeStaking.PoolState storage maycPoolState = poolStates[
                ApeStakingCommonLogic.MAYC_SINGLE_POOL_ID
            ];

            require(
                maycPoolState.tokenStatus[apeTokenId].isInPool,
                Errors.NFT_NOT_IN_POOL
            );
            require(
                bakcPoolState.tokenStatus[bakcTokenId].isInPool,
                Errors.NFT_NOT_IN_POOL
            );

            // construct staking data
            _maycPairs[index] = ApeCoinStaking.PairNftDepositWithAmount({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId,
                amount: vars.bakcMatchedCap.toUint184()
            });

            //emit event
            emit BakcStaked(false, apeTokenId, bakcTokenId);
        }

        // prepare Ape coin
        uint256 totalBorrow = vars.bakcMatchedCap *
            (baycArrayLength + maycArrayLength);
        uint256 cApeDebtShare = ApeStakingCommonLogic.borrowCApeFromPool(
            vars,
            totalBorrow
        );

        //stake in ApeCoinStaking
        vars.apeCoinStaking.depositBAKC(_baycPairs, _maycPairs);

        //update bakc pool state
        bakcPoolState.stakingPosition += (baycArrayLength + maycArrayLength)
            .toUint24();
        bakcPoolState.cApeDebtShare += cApeDebtShare.toUint104();
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
                Errors.NFT_NOT_IN_POOL
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
        mapping(uint256 => IParaApeStaking.PoolState) storage poolStates,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        IParaApeStaking.BAKCPairActionInfo calldata actionInfo
    ) external {
        _validateBAKCPairActionInfo(actionInfo);
        uint256 baycArrayLength = actionInfo.baycTokenIds.length;
        uint256 maycArrayLength = actionInfo.maycTokenIds.length;

        ApeCoinStaking.PairNft[]
            memory _baycPairs = new ApeCoinStaking.PairNft[](baycArrayLength);
        ApeCoinStaking.PairNft[]
            memory _maycPairs = new ApeCoinStaking.PairNft[](maycArrayLength);
        IParaApeStaking.PoolState storage bakcPoolState = poolStates[
            ApeStakingCommonLogic.BAKC_SINGLE_POOL_ID
        ];

        for (uint256 index = 0; index < baycArrayLength; index++) {
            uint32 apeTokenId = actionInfo.baycTokenIds[index];
            uint32 bakcTokenId = actionInfo.bakcPairBaycTokenIds[index];

            // we just need to check bakc is in the pool
            require(
                bakcPoolState.tokenStatus[bakcTokenId].isInPool,
                Errors.NFT_NOT_IN_POOL
            );

            // construct staking data
            _baycPairs[index] = ApeCoinStaking.PairNft({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId
            });

            //emit event
            emit BakcCompounded(true, apeTokenId, bakcTokenId);
        }

        for (uint256 index = 0; index < maycArrayLength; index++) {
            uint32 apeTokenId = actionInfo.maycTokenIds[index];
            uint32 bakcTokenId = actionInfo.bakcPairMaycTokenIds[index];

            // we just need to check bakc is in the pool
            require(
                bakcPoolState.tokenStatus[bakcTokenId].isInPool,
                Errors.NFT_NOT_IN_POOL
            );

            // construct staking data
            _maycPairs[index] = ApeCoinStaking.PairNft({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId
            });

            //emit event
            emit BakcCompounded(false, apeTokenId, bakcTokenId);
        }

        vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
        vars.apeCoinStaking.claimSelfBAKC(_baycPairs, _maycPairs);
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
        (
            vars.totalRepay,
            vars.totalCompoundFee
        ) = _calculateRepayAndCompoundBAKC(poolStates, vars);

        if (vars.totalRepay > 0) {
            IPool(vars.pool).repay(vars.cApe, vars.totalRepay, address(this));
        }
        if (vars.totalCompoundFee > 0) {
            cApeShareBalance[address(this)] += vars.totalCompoundFee;
        }
    }

    function claimNFT(
        mapping(uint256 => IParaApeStaking.PoolState) storage poolStates,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) external {
        ApeStakingCommonLogic.validateTokenIdArray(tokenIds);

        uint256 poolId = (nft == vars.bayc)
            ? ApeStakingCommonLogic.BAYC_SINGLE_POOL_ID
            : (nft == vars.mayc)
            ? ApeStakingCommonLogic.MAYC_SINGLE_POOL_ID
            : ApeStakingCommonLogic.BAKC_SINGLE_POOL_ID;
        IParaApeStaking.PoolState storage poolState = poolStates[poolId];
        _claimNFT(poolState, vars, true, nft, tokenIds);
    }

    function withdrawNFT(
        mapping(uint256 => IParaApeStaking.PoolState) storage poolStates,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) external {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, Errors.INVALID_PARAMETER);

        uint256 poolId = (nft == vars.bayc)
            ? ApeStakingCommonLogic.BAYC_SINGLE_POOL_ID
            : (nft == vars.mayc)
            ? ApeStakingCommonLogic.MAYC_SINGLE_POOL_ID
            : ApeStakingCommonLogic.BAKC_SINGLE_POOL_ID;

        //claim pending reward
        IParaApeStaking.PoolState storage poolState = poolStates[poolId];
        address nApeOwner = _claimNFT(poolState, vars, false, nft, tokenIds);
        if (nft == vars.bayc) {
            _unstakeApe(poolStates, cApeShareBalance, vars, true, tokenIds);
        } else if (nft == vars.mayc) {
            _unstakeApe(poolStates, cApeShareBalance, vars, false, tokenIds);
        } else {
            _unstakeBAKC(poolStates, cApeShareBalance, vars, tokenIds);
        }

        //transfer nft back to nToken
        require(msg.sender == nApeOwner, Errors.NOT_THE_OWNER);

        address nToken = (nft == vars.bayc) ? vars.nBayc : (nft == vars.mayc)
            ? vars.nMayc
            : vars.nBakc;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            delete poolState.tokenStatus[tokenId];

            IERC721(nft).safeTransferFrom(address(this), nToken, tokenId);

            //emit event
            emit NFTWithdrawn(nft, tokenId);
        }
    }

    function _unstakeApe(
        mapping(uint256 => IParaApeStaking.PoolState) storage poolStates,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool isBAYC,
        uint32[] calldata tokenIds
    ) internal {
        IParaApeStaking.PoolState storage apePoolState;
        if (isBAYC) {
            vars.apeStakingPoolId = ApeStakingCommonLogic.BAYC_POOL_ID;
            vars.positionCap = vars.baycMatchedCap;
            apePoolState = poolStates[
                ApeStakingCommonLogic.BAYC_SINGLE_POOL_ID
            ];
        } else {
            vars.apeStakingPoolId = ApeStakingCommonLogic.MAYC_POOL_ID;
            vars.positionCap = vars.maycMatchedCap;
            apePoolState = poolStates[
                ApeStakingCommonLogic.MAYC_SINGLE_POOL_ID
            ];
        }
        apePoolState.totalPosition -= tokenIds.length.toUint24();

        ApeCoinStaking.SingleNft[]
            memory _nfts = new ApeCoinStaking.SingleNft[](tokenIds.length);
        ApeCoinStaking.PairNftWithdrawWithAmount[]
            memory _nftPairs = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                tokenIds.length
            );
        uint24 singleStakingCount;
        uint24 pairStakingCount;
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
        IParaApeStaking.PoolState storage bakcPoolState = poolStates[
            ApeStakingCommonLogic.BAKC_SINGLE_POOL_ID
        ];
        bakcPoolState.stakingPosition -= pairStakingCount;

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
            IAutoCompoundApe(vars.cApe).deposit(
                address(this),
                vars.totalClaimedApe
            );

            (
                uint256 bakcTotalRepay,
                uint256 bakcCompoundFee
            ) = _calculateRepayAndCompoundBAKC(poolStates, vars);
            vars.totalRepay += bakcTotalRepay;
            vars.totalCompoundFee += bakcCompoundFee;
        }

        if (vars.totalRepay > 0) {
            IPool(vars.pool).repay(vars.cApe, vars.totalRepay, address(this));
        }
        if (vars.totalCompoundFee > 0) {
            cApeShareBalance[address(this)] += vars.totalCompoundFee;
        }
    }

    function _unstakeBAKC(
        mapping(uint256 => IParaApeStaking.PoolState) storage poolStates,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        uint32[] calldata tokenIds
    ) internal {
        uint256 arrayLength = tokenIds.length;
        IParaApeStaking.PoolState storage bakcPoolState = poolStates[
            ApeStakingCommonLogic.BAKC_SINGLE_POOL_ID
        ];
        bakcPoolState.totalPosition -= arrayLength.toUint24();
        ApeCoinStaking.PairNftWithdrawWithAmount[]
            memory baycPair = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                arrayLength
            );
        ApeCoinStaking.PairNftWithdrawWithAmount[]
            memory maycPair = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                arrayLength
            );
        uint24 baycPairCount;
        uint24 maycPairCount;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            (uint256 mainTokenId, bool isPaired) = vars
                .apeCoinStaking
                .bakcToMain(tokenId, ApeStakingCommonLogic.BAYC_POOL_ID);
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
                ApeStakingCommonLogic.MAYC_POOL_ID
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

        vars.cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
        vars.latestBorrowIndex = IPool(vars.pool)
            .getReserveNormalizedVariableDebt(vars.cApe);
        if (baycPairCount > 0 || maycPairCount > 0) {
            bakcPoolState.stakingPosition -= (baycPairCount + maycPairCount);

            vars.balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
            vars.apeCoinStaking.withdrawBAKC(baycPair, maycPair);
            vars.balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
            vars.totalClaimedApe = vars.balanceAfter - vars.balanceBefore;
            IAutoCompoundApe(vars.cApe).deposit(
                address(this),
                vars.totalClaimedApe
            );

            (
                vars.totalRepay,
                vars.totalCompoundFee
            ) = _calculateRepayAndCompoundBAKC(poolStates, vars);

            if (vars.totalRepay > 0) {
                IPool(vars.pool).repay(
                    vars.cApe,
                    vars.totalRepay,
                    address(this)
                );
            }
            if (vars.totalCompoundFee > 0) {
                cApeShareBalance[address(this)] += vars.totalCompoundFee;
            }
        }
    }

    function calculatePendingReward(
        mapping(uint256 => IParaApeStaking.PoolState) storage poolStates,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    ) external view returns (uint256) {
        uint256 poolId = (nft == vars.bayc)
            ? ApeStakingCommonLogic.BAYC_SINGLE_POOL_ID
            : (nft == vars.mayc)
            ? ApeStakingCommonLogic.MAYC_SINGLE_POOL_ID
            : ApeStakingCommonLogic.BAKC_SINGLE_POOL_ID;
        IParaApeStaking.PoolState storage poolState = poolStates[poolId];
        (, uint256 pendingReward, ) = _calculatePendingReward(
            poolState,
            vars,
            nft,
            tokenIds
        );
        return pendingReward;
    }

    function _calculatePendingReward(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address nft,
        uint32[] calldata tokenIds
    )
        internal
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
        address nToken = (nft == vars.bayc) ? vars.nBayc : (nft == vars.mayc)
            ? vars.nMayc
            : vars.nBakc;
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

            IParaApeStaking.TokenStatus memory tokenStatus = poolState
                .tokenStatus[tokenId];
            require(tokenStatus.isInPool, Errors.NFT_NOT_IN_POOL);

            //update reward, to save gas we don't claim pending reward in ApeCoinStaking.
            rewardShares += (accumulatedRewardsPerNft -
                tokenStatus.rewardsDebt);
        }
        pendingReward = ICApe(vars.cApe).getPooledApeByShares(rewardShares);
    }

    function _claimNFT(
        IParaApeStaking.PoolState storage poolState,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bool needUpdateStatus,
        address nft,
        uint32[] calldata tokenIds
    ) internal returns (address) {
        (
            address owner,
            uint256 pendingReward,
            uint128 accumulatedRewardsPerNft
        ) = _calculatePendingReward(poolState, vars, nft, tokenIds);

        if (pendingReward > 0) {
            uint256 arrayLength = tokenIds.length;
            for (uint256 index = 0; index < arrayLength; index++) {
                uint32 tokenId = tokenIds[index];

                if (needUpdateStatus) {
                    poolState
                        .tokenStatus[tokenId]
                        .rewardsDebt = accumulatedRewardsPerNft;
                }

                //emit event
                emit NFTClaimed(nft, tokenId);
            }

            IERC20(vars.cApe).safeTransfer(owner, pendingReward);
        }

        return owner;
    }

    function _calculateRepayAndCompoundBAKC(
        mapping(uint256 => IParaApeStaking.PoolState) storage poolStates,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars
    ) internal returns (uint256, uint256) {
        IParaApeStaking.PoolState storage bakcPoolState = poolStates[
            ApeStakingCommonLogic.BAKC_SINGLE_POOL_ID
        ];
        uint256 cApeDebtShare = bakcPoolState.cApeDebtShare;
        uint256 debtInterest = ApeStakingCommonLogic
            .calculateCurrentPositionDebtInterest(
                cApeDebtShare,
                bakcPoolState.stakingPosition,
                vars.bakcMatchedCap,
                vars.cApeExchangeRate,
                vars.latestBorrowIndex
            );
        uint256 repayAmount = (debtInterest >= vars.totalClaimedApe)
            ? vars.totalClaimedApe
            : debtInterest;
        cApeDebtShare -= repayAmount.rayDiv(vars.latestBorrowIndex).rayDiv(
            vars.cApeExchangeRate
        );
        bakcPoolState.cApeDebtShare = cApeDebtShare.toUint104();
        uint256 compoundFee = 0;
        if (vars.totalClaimedApe > debtInterest) {
            //update reward index
            uint256 shareRewardAmount = (vars.totalClaimedApe - debtInterest)
                .rayDiv(vars.cApeExchangeRate);
            compoundFee = shareRewardAmount.percentMul(vars.compoundFee);
            shareRewardAmount -= compoundFee;

            uint256 apeShareAmount = shareRewardAmount.percentMul(
                vars.apeRewardRatio
            );

            IParaApeStaking.PoolState storage baycPoolState = poolStates[
                ApeStakingCommonLogic.BAYC_SINGLE_POOL_ID
            ];
            IParaApeStaking.PoolState storage maycPoolState = poolStates[
                ApeStakingCommonLogic.MAYC_SINGLE_POOL_ID
            ];
            uint24 baycPositon = baycPoolState.totalPosition;
            uint24 maycPositon = maycPoolState.totalPosition;
            uint24 apeTotalPosition = baycPositon + maycPositon;
            if (apeTotalPosition != 0) {
                uint256 baycShareAmount = (apeShareAmount * baycPositon) /
                    apeTotalPosition;
                uint256 maycShareAmount = apeShareAmount - baycShareAmount;
                if (baycPositon != 0) {
                    baycPoolState.accumulatedRewardsPerNft +=
                        baycShareAmount.toUint104() /
                        baycPositon;
                }
                if (maycPositon != 0) {
                    maycPoolState.accumulatedRewardsPerNft +=
                        maycShareAmount.toUint104() /
                        maycPositon;
                }
            } else {
                compoundFee += apeShareAmount;
            }
            uint104 bakcTotalPosition = bakcPoolState.totalPosition;
            shareRewardAmount -= apeShareAmount;
            if (bakcTotalPosition != 0) {
                bakcPoolState.accumulatedRewardsPerNft +=
                    shareRewardAmount.toUint104() /
                    bakcTotalPosition;
            } else {
                compoundFee += shareRewardAmount;
            }
        }

        return (repayAmount, compoundFee);
    }

    function _validateBAKCPairActionInfo(
        IParaApeStaking.BAKCPairActionInfo calldata actionInfo
    ) internal pure {
        uint256 baycArrayLength = actionInfo.baycTokenIds.length;
        uint256 maycArrayLength = actionInfo.maycTokenIds.length;
        require(
            baycArrayLength == actionInfo.bakcPairBaycTokenIds.length,
            Errors.INVALID_PARAMETER
        );
        require(
            maycArrayLength == actionInfo.bakcPairMaycTokenIds.length,
            Errors.INVALID_PARAMETER
        );
        require(
            baycArrayLength > 0 || maycArrayLength > 0,
            Errors.INVALID_PARAMETER
        );
    }
}
