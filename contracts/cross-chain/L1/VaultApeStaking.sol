// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../dependencies/openzeppelin/contracts/ReentrancyGuard.sol";
import "../../dependencies/openzeppelin/contracts//Pausable.sol";
import "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import {WadRayMath} from "../../protocol/libraries/math/WadRayMath.sol";
import {PercentageMath} from "../../protocol/libraries/math/PercentageMath.sol";
import "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import "../../interfaces/IACLManager.sol";
import "../../interfaces/ICApe.sol";
import "./IParaxL1MessageHandler.sol";
import "./IVaultApeStaking.sol";

contract VaultApeStaking is ReentrancyGuard, Pausable, IVaultApeStaking {
    using WadRayMath for uint256;
    using SafeCast for uint256;
    using PercentageMath for uint256;

    bytes32 constant APE_STAKING_STORAGE_POSITION =
        bytes32(
            uint256(keccak256("vault.apestaking.implementation.storage")) - 1
        );

    struct ApeStakingStorage {
        mapping(address => PoolState) poolStates;
        uint128 accuCompoundFee;
        uint32 compoundFeeRate;
        address apeStakingBot;
    }

    address internal immutable bayc;
    address internal immutable mayc;
    address internal immutable bakc;
    address internal immutable apeCoin;
    ICApe internal immutable cApe;
    ApeCoinStaking internal immutable apeCoinStaking;
    uint256 private immutable baycMatchedCap;
    uint256 private immutable maycMatchedCap;
    uint256 private immutable bakcMatchedCap;
    IACLManager private immutable aclManager;
    IParaxL1MessageHandler internal immutable l1MsgHander;

    constructor(
        address _bayc,
        address _mayc,
        address _bakc,
        address _apeCoin,
        address _cApe,
        address _apeCoinStaking,
        address _aclManager,
        IParaxL1MessageHandler _msgHandler
    ) {
        bayc = _bayc;
        mayc = _mayc;
        bakc = _bakc;
        apeCoin = _apeCoin;
        cApe = ICApe(_cApe);
        apeCoinStaking = ApeCoinStaking(_apeCoinStaking);
        aclManager = IACLManager(_aclManager);
        l1MsgHander = _msgHandler;

        (
            ,
            ApeCoinStaking.PoolUI memory baycPool,
            ApeCoinStaking.PoolUI memory maycPool,
            ApeCoinStaking.PoolUI memory bakcPool
        ) = apeCoinStaking.getPoolsUI();

        baycMatchedCap = baycPool.currentTimeRange.capPerPosition;
        maycMatchedCap = maycPool.currentTimeRange.capPerPosition;
        bakcMatchedCap = bakcPool.currentTimeRange.capPerPosition;
    }

    function initialize() external {
        //approve ApeCoin for apeCoinStaking
        uint256 allowance = IERC20(apeCoin).allowance(
            address(this),
            address(apeCoinStaking)
        );
        if (allowance == 0) {
            IERC20(apeCoin).approve(address(apeCoinStaking), type(uint256).max);
        }

        //approve ApeCoin for cApe
        allowance = IERC20(apeCoin).allowance(address(this), address(cApe));
        if (allowance == 0) {
            IERC20(apeCoin).approve(address(cApe), type(uint256).max);
        }
    }

    /// @inheritdoc IVaultApeStaking
    function stakingApe(
        bool isBAYC,
        uint32[] calldata tokenIds
    ) external override whenNotPaused nonReentrant {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, Errors.INVALID_PARAMETER);
        ApeStakingStorage storage ds = apeStakingStorage();
        require(ds.apeStakingBot == msg.sender, Errors.NOT_APE_STAKING_BOT);

        address nft = isBAYC ? bayc : mayc;
        uint256 positionCap = isBAYC ? baycMatchedCap : maycMatchedCap;
        PoolState storage poolState = ds.poolStates[nft];
        ApeCoinStaking.SingleNft[]
            memory _nfts = new ApeCoinStaking.SingleNft[](arrayLength);
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            TokenStatus memory tokenStatus = poolState.tokenStatus[tokenId];
            require(
                tokenStatus.beneficiary != address(0),
                Errors.NFT_NOT_IN_POOL
            );
            require(!tokenStatus.isStaking, Errors.ALREADY_STAKING);

            // construct staking data
            _nfts[index] = ApeCoinStaking.SingleNft({
                tokenId: tokenId,
                amount: positionCap.toUint224()
            });

            tokenStatus.isStaking = true;
            poolState.tokenStatus[tokenId] = tokenStatus;

            //emit event
            emit ApeStaked(isBAYC, tokenId);
        }

        // prepare Ape coin
        uint256 totalBorrow = positionCap * arrayLength;
        cApe.borrowApeCoin(totalBorrow);

        //stake in ApeCoinStaking
        if (isBAYC) {
            apeCoinStaking.depositBAYC(_nfts);
        } else {
            apeCoinStaking.depositMAYC(_nfts);
        }

        poolState.stakingPosition += arrayLength.toUint24();
    }

    /// @inheritdoc IVaultApeStaking
    function stakingBAKC(
        BAKCPairActionInfo calldata actionInfo
    ) external override whenNotPaused nonReentrant {
        (
            uint256 baycArrayLength,
            uint256 maycArrayLength
        ) = _validateBAKCPairActionInfo(actionInfo);
        ApeStakingStorage storage ds = apeStakingStorage();
        require(ds.apeStakingBot == msg.sender, Errors.NOT_APE_STAKING_BOT);

        ApeCoinStaking.PairNftDepositWithAmount[]
            memory _baycPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                baycArrayLength
            );
        ApeCoinStaking.PairNftDepositWithAmount[]
            memory _maycPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                maycArrayLength
            );

        PoolState storage bakcPoolState = ds.poolStates[bakc];
        PoolState storage baycPoolState = ds.poolStates[bayc];
        for (uint256 index = 0; index < baycArrayLength; index++) {
            uint32 apeTokenId = actionInfo.baycTokenIds[index];
            uint32 bakcTokenId = actionInfo.bakcPairBaycTokenIds[index];

            TokenStatus memory baycTokenStatus = baycPoolState.tokenStatus[
                apeTokenId
            ];
            TokenStatus memory bakcTokenStatus = bakcPoolState.tokenStatus[
                bakcTokenId
            ];
            require(
                baycTokenStatus.beneficiary != address(0),
                Errors.NFT_NOT_IN_POOL
            );
            require(!baycTokenStatus.isPairedStaking, Errors.ALREADY_STAKING);
            require(
                bakcTokenStatus.beneficiary != address(0),
                Errors.NFT_NOT_IN_POOL
            );
            require(!bakcTokenStatus.isStaking, Errors.ALREADY_STAKING);

            baycTokenStatus.isPairedStaking = true;
            baycTokenStatus.pairTokenId = bakcTokenId;
            bakcTokenStatus.isStaking = true;
            bakcTokenStatus.pairTokenId = apeTokenId;
            bakcTokenStatus.isPairedWithBayc = true;
            baycPoolState.tokenStatus[apeTokenId] = baycTokenStatus;
            bakcPoolState.tokenStatus[bakcTokenId] = bakcTokenStatus;

            // construct staking data
            _baycPairs[index] = ApeCoinStaking.PairNftDepositWithAmount({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId,
                amount: bakcMatchedCap.toUint184()
            });

            //emit event
            emit BakcStaked(true, apeTokenId, bakcTokenId);
        }

        PoolState storage maycPoolState = ds.poolStates[mayc];
        for (uint256 index = 0; index < maycArrayLength; index++) {
            uint32 apeTokenId = actionInfo.maycTokenIds[index];
            uint32 bakcTokenId = actionInfo.bakcPairMaycTokenIds[index];

            TokenStatus memory maycTokenStatus = maycPoolState.tokenStatus[
                apeTokenId
            ];
            TokenStatus memory bakcTokenStatus = bakcPoolState.tokenStatus[
                bakcTokenId
            ];
            require(
                maycTokenStatus.beneficiary != address(0),
                Errors.NFT_NOT_IN_POOL
            );
            require(!maycTokenStatus.isPairedStaking, Errors.ALREADY_STAKING);
            require(
                bakcTokenStatus.beneficiary != address(0),
                Errors.NFT_NOT_IN_POOL
            );
            require(!bakcTokenStatus.isStaking, Errors.ALREADY_STAKING);

            maycTokenStatus.isPairedStaking = true;
            maycTokenStatus.pairTokenId = bakcTokenId;
            bakcTokenStatus.isStaking = true;
            bakcTokenStatus.pairTokenId = apeTokenId;
            bakcTokenStatus.isPairedWithBayc = false;
            maycPoolState.tokenStatus[apeTokenId] = maycTokenStatus;
            bakcPoolState.tokenStatus[bakcTokenId] = bakcTokenStatus;

            // construct staking data
            _maycPairs[index] = ApeCoinStaking.PairNftDepositWithAmount({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId,
                amount: bakcMatchedCap.toUint184()
            });

            //emit event
            emit BakcStaked(false, apeTokenId, bakcTokenId);
        }

        // prepare Ape coin
        uint256 totalBorrow = bakcMatchedCap *
            (baycArrayLength + maycArrayLength);
        cApe.borrowApeCoin(totalBorrow);

        //stake in ApeCoinStaking
        apeCoinStaking.depositBAKC(_baycPairs, _maycPairs);

        //update bakc pool state
        bakcPoolState.stakingPosition += (baycArrayLength + maycArrayLength)
            .toUint24();
    }

    /// @inheritdoc IVaultApeStaking
    function compoundApe(
        bool isBAYC,
        uint32[] calldata tokenIds
    ) external override {
        ApeStakingStorage storage ds = apeStakingStorage();
        require(ds.apeStakingBot == msg.sender, Errors.NOT_APE_STAKING_BOT);

        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, Errors.INVALID_PARAMETER);

        uint256[] memory _nfts = new uint256[](arrayLength);
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            //skip check if token is in pool or in staking

            // construct staking data
            _nfts[index] = tokenId;

            //emit event
            emit ApeCompounded(isBAYC, tokenId);
        }

        uint256 balanceBefore = IERC20(apeCoin).balanceOf(address(this));
        if (isBAYC) {
            apeCoinStaking.claimSelfBAYC(_nfts);
        } else {
            apeCoinStaking.claimSelfMAYC(_nfts);
        }
        uint256 balanceAfter = IERC20(apeCoin).balanceOf(address(this));
        uint256 totalClaimedApe = balanceAfter - balanceBefore;

        address nft = isBAYC ? bayc : mayc;
        _distributeIncome(nft, totalClaimedApe);
    }

    /// @inheritdoc IVaultApeStaking
    function compoundBAKC(
        BAKCPairActionInfo calldata actionInfo
    ) external override {
        ApeStakingStorage storage ds = apeStakingStorage();
        require(ds.apeStakingBot == msg.sender, Errors.NOT_APE_STAKING_BOT);

        (
            uint256 baycArrayLength,
            uint256 maycArrayLength
        ) = _validateBAKCPairActionInfo(actionInfo);

        ApeCoinStaking.PairNft[]
            memory _baycPairs = new ApeCoinStaking.PairNft[](baycArrayLength);
        ApeCoinStaking.PairNft[]
            memory _maycPairs = new ApeCoinStaking.PairNft[](maycArrayLength);
        for (uint256 index = 0; index < baycArrayLength; index++) {
            uint32 apeTokenId = actionInfo.baycTokenIds[index];
            uint32 bakcTokenId = actionInfo.bakcPairBaycTokenIds[index];

            //skip check if token is in pool or in staking

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

            // construct staking data
            _maycPairs[index] = ApeCoinStaking.PairNft({
                mainTokenId: apeTokenId,
                bakcTokenId: bakcTokenId
            });

            //emit event
            emit BakcCompounded(false, apeTokenId, bakcTokenId);
        }

        uint256 balanceBefore = IERC20(apeCoin).balanceOf(address(this));
        apeCoinStaking.claimSelfBAKC(_baycPairs, _maycPairs);
        uint256 balanceAfter = IERC20(apeCoin).balanceOf(address(this));
        uint256 totalClaimedApe = balanceAfter - balanceBefore;

        _distributeIncome(bakc, totalClaimedApe);
    }

    /// @inheritdoc IVaultApeStaking
    function onboardCheckApeStakingPosition(
        address nft,
        uint32[] calldata tokenIds,
        address beneficiary
    ) external override {
        require(msg.sender == address(this), Errors.INVALID_CALLER);

        if (nft == bayc || nft == mayc || nft == bakc) {
            //ensure no ape position
            uint256 poolId = (nft == bayc) ? 1 : ((nft == mayc) ? 2 : 3);
            PoolState storage poolState = apeStakingStorage().poolStates[nft];

            uint256 arrayLength = tokenIds.length;
            for (uint256 index = 0; index < arrayLength; index++) {
                uint32 tokenId = tokenIds[index];
                (uint256 stakedAmount, ) = apeCoinStaking.nftPosition(
                    poolId,
                    tokenId
                );
                require(stakedAmount == 0, Errors.ALREADY_STAKING);
                if (nft == bayc || nft == mayc) {
                    (, bool isPaired) = apeCoinStaking.mainToBakc(
                        poolId,
                        tokenId
                    );
                    require(!isPaired, Errors.ALREADY_STAKING);
                }

                TokenStatus memory tokenStatus = poolState.tokenStatus[tokenId];
                require(
                    tokenStatus.beneficiary == address(0),
                    Errors.INVALID_STATUS
                );

                tokenStatus.beneficiary = beneficiary;
                tokenStatus.rewardsDebt = poolState.accumulatedRewardsPerNft;
                poolState.tokenStatus[tokenId] = tokenStatus;
            }

            poolState.totalPosition += arrayLength.toUint32();
        }
    }

    /// @inheritdoc IVaultApeStaking
    function offboardCheckApeStakingPosition(
        address nft,
        uint32[] calldata tokenIds
    ) external override {
        ApeStakingStorage storage ds = apeStakingStorage();
        //ensure ownership by bridge, don't validate ownership here
        require(
            msg.sender == address(this) || msg.sender == ds.apeStakingBot,
            Errors.INVALID_CALLER
        );

        PoolState storage poolState = ds.poolStates[nft];
        if (poolState.totalPosition > 0) {
            uint256 arrayLength = tokenIds.length;
            for (uint256 index = 0; index < arrayLength; index++) {
                uint32 tokenId = tokenIds[index];

                if (poolState.stakingPosition > 0) {
                    TokenStatus memory tokenStatus = poolState.tokenStatus[
                        tokenId
                    ];
                    if (nft == bakc) {
                        if (tokenStatus.isStaking) {
                            uint32[] memory ids = new uint32[](1);
                            ids[0] = tokenStatus.pairTokenId;
                            _unstakeApe(tokenStatus.isPairedWithBayc, ids);
                        }
                    } else {
                        if (
                            tokenStatus.isStaking || tokenStatus.isPairedStaking
                        ) {
                            bool isBAYC = (nft == bayc);
                            uint32[] memory ids = new uint32[](1);
                            ids[0] = tokenId;
                            _unstakeApe(isBAYC, ids);
                        }
                    }
                }

                //claim one by one, since every token id may have a different beneficiary
                uint256 cApeExchangeRate = cApe.getPooledApeByShares(
                    WadRayMath.RAY
                );
                uint256 rewardShare = _claimPendingReward(
                    poolState.tokenStatus[tokenId],
                    poolState.accumulatedRewardsPerNft,
                    nft,
                    tokenId,
                    cApeExchangeRate
                );
                if (rewardShare > 0) {
                    uint256 pendingReward = rewardShare.rayMul(
                        cApeExchangeRate
                    );
                    cApe.transfer(
                        poolState.tokenStatus[tokenId].beneficiary,
                        pendingReward
                    );
                }

                // we also reduce totalPosition one by one for accuracy
                poolState.totalPosition -= 1;
                delete poolState.tokenStatus[tokenId];
            }
        }
    }

    /// @inheritdoc IVaultApeStaking
    function unstakeApe(bool isBAYC, uint32[] calldata tokenIds) external {
        require(
            apeStakingStorage().apeStakingBot == msg.sender,
            Errors.NOT_APE_STAKING_BOT
        );

        require(tokenIds.length > 0, Errors.INVALID_PARAMETER);
        _unstakeApe(isBAYC, tokenIds);
    }

    function _unstakeApe(bool isBAYC, uint32[] memory tokenIds) internal {
        address nft = isBAYC ? bayc : mayc;
        uint256 positionCap = isBAYC ? baycMatchedCap : maycMatchedCap;
        PoolState storage poolState = apeStakingStorage().poolStates[nft];

        uint256 arrayLength = tokenIds.length;
        ApeCoinStaking.SingleNft[]
            memory _nfts = new ApeCoinStaking.SingleNft[](arrayLength);
        ApeCoinStaking.PairNftWithdrawWithAmount[]
            memory _nftPairs = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                arrayLength
            );
        uint24 singleStakingCount;
        uint24 pairStakingCount;
        for (uint256 index = 0; index < tokenIds.length; index++) {
            uint32 tokenId = tokenIds[index];

            TokenStatus memory tokenStatus = poolState.tokenStatus[tokenId];
            if (tokenStatus.isStaking) {
                _nfts[singleStakingCount] = ApeCoinStaking.SingleNft({
                    tokenId: tokenId,
                    amount: positionCap.toUint224()
                });
                singleStakingCount++;
            }

            if (tokenStatus.isPairedStaking) {
                _nftPairs[pairStakingCount] = ApeCoinStaking
                    .PairNftWithdrawWithAmount({
                        mainTokenId: tokenId,
                        bakcTokenId: tokenStatus.pairTokenId,
                        amount: bakcMatchedCap.toUint184(),
                        isUncommit: true
                    });
                pairStakingCount++;
            }
        }

        if (singleStakingCount > 0) {
            assembly {
                mstore(_nfts, singleStakingCount)
            }
            uint256 balanceBefore = IERC20(apeCoin).balanceOf(address(this));
            if (isBAYC) {
                apeCoinStaking.withdrawBAYC(_nfts, address(this));
            } else {
                apeCoinStaking.withdrawMAYC(_nfts, address(this));
            }
            uint256 balanceAfter = IERC20(apeCoin).balanceOf(address(this));
            uint256 totalClaimedApe = balanceAfter - balanceBefore;

            uint256 principle = positionCap * singleStakingCount;
            cApe.repayApeCoin(principle);
            uint256 income = totalClaimedApe - principle;
            _distributeIncome(nft, income);

            poolState.stakingPosition -= singleStakingCount;
        }

        if (pairStakingCount > 0) {
            assembly {
                mstore(_nftPairs, pairStakingCount)
            }
            uint256 balanceBefore = IERC20(apeCoin).balanceOf(address(this));
            ApeCoinStaking.PairNftWithdrawWithAmount[]
                memory _otherPairs = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                    0
                );
            if (isBAYC) {
                apeCoinStaking.withdrawBAKC(_nftPairs, _otherPairs);
            } else {
                apeCoinStaking.withdrawBAKC(_otherPairs, _nftPairs);
            }
            uint256 balanceAfter = IERC20(apeCoin).balanceOf(address(this));
            uint256 totalClaimedApe = balanceAfter - balanceBefore;

            uint256 principle = bakcMatchedCap * pairStakingCount;
            cApe.repayApeCoin(principle);
            uint256 income = totalClaimedApe - principle;
            _distributeIncome(bakc, income);

            PoolState storage bakcPoolState = apeStakingStorage().poolStates[
                bakc
            ];
            bakcPoolState.stakingPosition -= pairStakingCount;
        }
    }

    function _distributeIncome(address nft, uint256 totalClaimedApe) internal {
        ApeStakingStorage storage ds = apeStakingStorage();
        PoolState storage poolState = ds.poolStates[nft];
        //first part compound fee
        uint256 fee = totalClaimedApe.percentMul(ds.compoundFeeRate);
        //second part repay cape
        uint256 cApeIncome = (totalClaimedApe - fee).percentMul(
            poolState.cApeIncomeRatio
        );
        //third ape pool income
        uint256 poolIncome = totalClaimedApe - fee - cApeIncome;

        cApe.notifyReward(cApeIncome);
        cApe.deposit(address(this), fee + poolIncome);
        uint256 cApeExchangeRate = cApe.getPooledApeByShares(WadRayMath.RAY);
        poolState.accumulatedRewardsPerNft += (poolIncome.rayDiv(
            cApeExchangeRate
        ) / poolState.totalPosition).toUint128();
        ds.accuCompoundFee += (fee.rayDiv(cApeExchangeRate)).toUint128();
    }

    function _validateBAKCPairActionInfo(
        BAKCPairActionInfo calldata actionInfo
    ) internal pure returns (uint256 baycArrayLength, uint256 maycArrayLength) {
        baycArrayLength = actionInfo.baycTokenIds.length;
        maycArrayLength = actionInfo.maycTokenIds.length;
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

    /// @inheritdoc IVaultApeStaking
    function getTokenStatus(
        address nft,
        uint256 tokenId
    ) external view returns (TokenStatus memory) {
        ApeStakingStorage storage ds = apeStakingStorage();
        return ds.poolStates[nft].tokenStatus[tokenId];
    }

    /// @inheritdoc IVaultApeStaking
    function getPendingReward(
        address nft,
        uint32[] calldata tokenIds
    ) external view returns (uint256) {
        uint256 rewardShares;
        uint256 arrayLength = tokenIds.length;

        PoolState storage poolState = apeStakingStorage().poolStates[nft];
        uint256 accumulatedRewardsPerNft = poolState.accumulatedRewardsPerNft;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            TokenStatus memory tokenStatus = poolState.tokenStatus[tokenId];
            require(
                tokenStatus.beneficiary != address(0),
                Errors.NFT_NOT_IN_POOL
            );

            rewardShares += (accumulatedRewardsPerNft -
                tokenStatus.rewardsDebt);
        }
        return ICApe(cApe).getPooledApeByShares(rewardShares);
    }

    /// @inheritdoc IVaultApeStaking
    function claimPendingReward(
        address nft,
        uint32[] calldata tokenIds
    ) external whenNotPaused nonReentrant {
        uint256 totalRewardShares;
        uint256 cApeExchangeRate = cApe.getPooledApeByShares(WadRayMath.RAY);

        PoolState storage poolState = apeStakingStorage().poolStates[nft];
        uint128 accumulatedRewardsPerNft = poolState.accumulatedRewardsPerNft;
        uint256 arrayLength = tokenIds.length;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            TokenStatus memory tokenStatus = poolState.tokenStatus[tokenId];
            //ensure token id is in pool and caller is valid by checking beneficiary
            require(
                msg.sender == tokenStatus.beneficiary,
                Errors.INVALID_CALLER
            );
            totalRewardShares += _claimPendingReward(
                poolState.tokenStatus[tokenId],
                accumulatedRewardsPerNft,
                nft,
                tokenId,
                cApeExchangeRate
            );
        }

        if (totalRewardShares > 0) {
            uint256 pendingReward = totalRewardShares.rayMul(cApeExchangeRate);
            cApe.transfer(msg.sender, pendingReward);
        }
    }

    function _claimPendingReward(
        TokenStatus storage tokenStatus,
        uint256 accumulatedRewardsPerNft,
        address nft,
        uint256 tokenId,
        uint256 cApeExchangeRate
    ) internal returns (uint256 rewardShare) {
        rewardShare = accumulatedRewardsPerNft - tokenStatus.rewardsDebt;
        tokenStatus.rewardsDebt = accumulatedRewardsPerNft.toUint128();

        //emit event
        emit PoolRewardClaimed(
            nft,
            tokenId,
            rewardShare.rayMul(cApeExchangeRate)
        );
    }

    /// @inheritdoc IVaultApeStaking
    function setApeStakingBot(address _apeStakingBot) external onlyPoolAdmin {
        ApeStakingStorage storage ds = apeStakingStorage();
        address oldValue = ds.apeStakingBot;
        if (oldValue != _apeStakingBot) {
            ds.apeStakingBot = _apeStakingBot;
            emit ApeStakingBotUpdated(oldValue, _apeStakingBot);
        }
    }

    /// @inheritdoc IVaultApeStaking
    function setCompoundFeeRate(
        uint32 _compoundFeeRate
    ) external onlyPoolAdmin {
        //0.1e4 means 10%
        require(_compoundFeeRate <= 0.1e4, Errors.INVALID_PARAMETER);
        ApeStakingStorage storage ds = apeStakingStorage();
        uint32 oldValue = ds.compoundFeeRate;
        if (oldValue != _compoundFeeRate) {
            ds.compoundFeeRate = _compoundFeeRate;
            emit CompoundFeeRateUpdated(oldValue, _compoundFeeRate);
        }
    }

    /// @inheritdoc IVaultApeStaking
    function setCApeIncomeRate(
        address nft,
        uint32 rate
    ) external onlyPoolAdmin {
        require(rate <= 1e4, Errors.INVALID_PARAMETER);
        ApeStakingStorage storage ds = apeStakingStorage();
        PoolState storage poolState = ds.poolStates[nft];
        uint32 oldValue = poolState.cApeIncomeRatio;
        if (oldValue != rate) {
            poolState.cApeIncomeRatio = rate;
            emit CApeIncomeRateUpdated(nft, oldValue, rate);
        }
    }

    /// @inheritdoc IVaultApeStaking
    function claimCompoundFee(address receiver) external {
        ApeStakingStorage storage ds = apeStakingStorage();
        require(ds.apeStakingBot == msg.sender, Errors.NOT_APE_STAKING_BOT);
        uint256 fee = ds.accuCompoundFee;
        if (fee > 0) {
            uint256 amount = cApe.getPooledApeByShares(fee);
            cApe.transfer(receiver, amount);
            ds.accuCompoundFee = 0;

            emit CompoundFeeClaimed(amount);
        }
    }

    /// @inheritdoc IVaultApeStaking
    function compoundFee() external view returns (uint256) {
        ApeStakingStorage storage ds = apeStakingStorage();
        return ds.accuCompoundFee;
    }

    /// @inheritdoc IVaultApeStaking
    function updateBeneficiary(
        address nft,
        uint32[] calldata tokenIds,
        address newBenificiary
    ) external onlyMsgHandler {
        uint256 cApeExchangeRate = cApe.getPooledApeByShares(WadRayMath.RAY);

        PoolState storage poolState = apeStakingStorage().poolStates[nft];
        uint128 accumulatedRewardsPerNft = poolState.accumulatedRewardsPerNft;
        uint256 arrayLength = tokenIds.length;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];

            TokenStatus memory tokenStatus = poolState.tokenStatus[tokenId];
            uint256 rewardShare = accumulatedRewardsPerNft -
                tokenStatus.rewardsDebt;
            if (rewardShare > 0) {
                tokenStatus.rewardsDebt = accumulatedRewardsPerNft;
                uint256 pendingReward = rewardShare.rayMul(cApeExchangeRate);
                cApe.transfer(tokenStatus.beneficiary, pendingReward);

                //emit event
                emit PoolRewardClaimed(
                    nft,
                    tokenId,
                    rewardShare.rayMul(cApeExchangeRate)
                );
            }
            tokenStatus.beneficiary = newBenificiary;
            poolState.tokenStatus[tokenId] = tokenStatus;

            emit BeneficiaryUpdated(nft, tokenId, newBenificiary);
        }
    }

    modifier onlyMsgHandler() {
        require(msg.sender == address(l1MsgHander), Errors.ONLY_MSG_HANDLER);
        _;
    }

    /**
     * @dev Only pool admin can call functions marked by this modifier.
     **/
    modifier onlyPoolAdmin() {
        _onlyPoolAdmin();
        _;
    }

    function _onlyPoolAdmin() internal view {
        require(
            aclManager.isPoolAdmin(msg.sender),
            Errors.CALLER_NOT_POOL_ADMIN
        );
    }

    function apeStakingStorage()
        internal
        pure
        returns (ApeStakingStorage storage ds)
    {
        bytes32 position = APE_STAKING_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }
}
