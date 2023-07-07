// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import "../../interfaces/IParaApeStaking.sol";
import {IERC20, SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {PercentageMath} from "../../protocol/libraries/math/PercentageMath.sol";
import "../../interfaces/IAutoCompoundApe.sol";
import "../../interfaces/ICApe.sol";
import {SignatureChecker} from "../../dependencies/looksrare/contracts/libraries/SignatureChecker.sol";
import "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {WadRayMath} from "../../protocol/libraries/math/WadRayMath.sol";
import {IPool} from "../../interfaces/IPool.sol";

/**
 * @title ApeStakingVaultLogic library
 *
 * @notice Implements the base logic for ape staking vault
 */
library ApeStakingCommonLogic {
    using PercentageMath for uint256;
    using SafeCast for uint256;
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

    function depositCApeShareForUser(
        mapping(address => uint256) storage cApeShareBalance,
        address user,
        uint256 amount
    ) internal {
        if (amount > 0) {
            cApeShareBalance[user] += amount;
        }
    }

    function calculateRepayAndCompound(
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
        uint256 debtInterest = calculateCurrentPositionDebtInterest(
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

    function borrowCApeFromPool(
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

    function calculateCurrentPositionDebtInterest(
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

    /*
    function stake(
        StakingType stakingType,
        uint32 mainTokenId,
        uint32 bakcTokenId
    ) external nonReentrant {
        (address ape, address apeNToken) = _getApeAndNTokenAddress(stakingType);

        //validate owner
        address apeNTokenOwner = IERC721(apeNToken).ownerOf(mainTokenId);
        require(msg.sender == apeNTokenOwner, "not ntoken owner");
        if (
            stakingType == StakingType.BAYCPairStaking ||
            stakingType == StakingType.MAYCPairStaking
        ) {
            address bakcNTokenOwner = IERC721(nBakc).ownerOf(bakcTokenId);
            require(msg.sender == bakcNTokenOwner, "not bakc ntoken owner");
        }

        //get all token
        _handleApeTransfer(ape, apeNToken, mainTokenId);
        uint256 apePositionCap = getApeCoinStakingCap(stakingType);
        uint256 latestBorrowIndex = IPool(pool).borrowPoolCApe(apePositionCap);
        IAutoCompoundApe(cApe).withdraw(apePositionCap);
        if (
            stakingType == StakingType.BAYCPairStaking ||
            stakingType == StakingType.MAYCPairStaking
        ) {
            IERC721(bakc).safeTransferFrom(nBakc, address(this), bakcTokenId);
        }

        //update status
        apeMatchedCount[ape][mainTokenId] += 1;
        {
            uint256 cApeExchangeRate = ICApe(cApe).getPooledApeByShares(
                WadRayMath.RAY
            );
            positionCApeShareDebt[stakingType][mainTokenId] = apePositionCap
                .rayDiv(latestBorrowIndex)
                .rayDiv(cApeExchangeRate);
        }

        //stake for ApeCoinStaking
        if (
            stakingType == StakingType.BAYCStaking ||
            stakingType == StakingType.BAYCPairStaking
        ) {
            ApeCoinStaking.SingleNft[]
                memory singleNft = new ApeCoinStaking.SingleNft[](1);
            singleNft[0].tokenId = mainTokenId;
            singleNft[0].amount = apePositionCap.toUint224();
            if (stakingType == StakingType.BAYCStaking) {
                apeCoinStaking.depositBAYC(singleNft);
            } else {
                apeCoinStaking.depositMAYC(singleNft);
            }
        } else {
            ApeCoinStaking.PairNftDepositWithAmount[]
                memory _stakingPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                    1
                );
            _stakingPairs[0].mainTokenId = mainTokenId;
            _stakingPairs[0].bakcTokenId = bakcTokenId;
            _stakingPairs[0].amount = apePositionCap.toUint184();
            ApeCoinStaking.PairNftDepositWithAmount[]
                memory _otherPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                    0
                );
            if (stakingType == StakingType.BAYCPairStaking) {
                apeCoinStaking.depositBAKC(_stakingPairs, _otherPairs);
            } else {
                apeCoinStaking.depositBAKC(_otherPairs, _stakingPairs);
            }
        }
    }

    function unstake(VaultPosition calldata position) external nonReentrant {
        (address ape, address apeNToken) = _getApeAndNTokenAddress(
            position.stakingType
        );

        // check owner
        address apeNTokenOwner = IERC721(apeNToken).ownerOf(
            position.mainTokenId
        );
        if (
            position.stakingType == StakingType.BAYCPairStaking ||
            position.stakingType == StakingType.MAYCPairStaking
        ) {
            require(msg.sender == apeNTokenOwner, "no permission to break up");
        } else {
            address nBakcOwner = IERC721(nBakc).ownerOf(position.bakcTokenId);
            require(
                msg.sender == apeNTokenOwner || msg.sender == nBakcOwner,
                "no permission to break up"
            );
        }

        //exit from ApeCoinStaking
        uint256 apePositionCap = getApeCoinStakingCap(position.stakingType);
        uint256 beforeBalance = IERC20(apeCoin).balanceOf(address(this));
        if (
            position.stakingType == StakingType.BAYCPairStaking ||
            position.stakingType == StakingType.MAYCPairStaking
        ) {
            ApeCoinStaking.SingleNft[]
                memory _nfts = new ApeCoinStaking.SingleNft[](1);
            _nfts[0].tokenId = position.mainTokenId;
            _nfts[0].amount = apePositionCap.toUint224();
            if (position.stakingType == StakingType.BAYCStaking) {
                apeCoinStaking.withdrawSelfBAYC(_nfts);
            } else {
                apeCoinStaking.withdrawSelfMAYC(_nfts);
            }
        } else {
            ApeCoinStaking.PairNftWithdrawWithAmount[]
                memory _nfts = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                    1
                );
            _nfts[0].mainTokenId = position.mainTokenId;
            _nfts[0].bakcTokenId = position.bakcTokenId;
            _nfts[0].amount = apePositionCap.toUint184();
            _nfts[0].isUncommit = true;
            ApeCoinStaking.PairNftWithdrawWithAmount[]
                memory _otherPairs = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                    0
                );
            if (position.stakingType == StakingType.BAYCPairStaking) {
                apeCoinStaking.withdrawBAKC(_nfts, _otherPairs);
            } else {
                apeCoinStaking.withdrawBAKC(_otherPairs, _nfts);
            }
        }
        uint256 afterBalance = IERC20(apeCoin).balanceOf(address(this));
        uint256 unstakeAmount = afterBalance - beforeBalance;
        IAutoCompoundApe(cApe).deposit(address(this), unstakeAmount);

        //repay ape position debt and interest debt
        {
            uint256 cApeExchangeRate = ICApe(cApe).getPooledApeByShares(
                WadRayMath.RAY
            );
            uint256 latestBorrowIndex = IPool(pool)
                .getReserveNormalizedVariableDebt(cApe);
            uint256 debtInterest = _calculateCurrentPositionDebtInterest(
                position,
                apePositionCap,
                cApeExchangeRate,
                latestBorrowIndex
            );
            uint256 totalDebt = debtInterest + apePositionCap;
            require(totalDebt <= unstakeAmount, "can't repay debt");
            IPool(pool).repay(cApe, totalDebt, address(this));
            delete positionCApeShareDebt[position.stakingType][
                position.mainTokenId
            ];

            // distribute left ape coin reward to nBAYC/nMAYC owner as cApe
            if (unstakeAmount > totalDebt) {
                uint256 leftAmount = unstakeAmount - totalDebt;
                uint256 feeAmount = leftAmount.percentMul(compoundFee);
                leftAmount -= feeAmount;
                uint256 leftShare = leftAmount.rayDiv(cApeExchangeRate);
                _depositCApeShareForUser(apeNTokenOwner, leftShare);
            }
        }

        // transfer Ape or BAKC to nToken
        uint256 matchedCount = apeMatchedCount[ape][position.mainTokenId];
        if (matchedCount == 1) {
            IERC721(ape).safeTransferFrom(
                address(this),
                apeNToken,
                position.mainTokenId
            );
        }
        apeMatchedCount[ape][position.mainTokenId] = matchedCount - 1;
        if (
            position.stakingType == StakingType.BAYCPairStaking ||
            position.stakingType == StakingType.MAYCPairStaking
        ) {
            IERC721(bakc).safeTransferFrom(
                address(this),
                nBakc,
                position.bakcTokenId
            );
        }
    }

    function claimAndCompound(VaultPosition[] calldata positions)
        external
        nonReentrant
    {
        //ignore getShareByPooledApe return 0 case.
        uint256 cApeExchangeRate = ICApe(cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
        uint256 latestBorrowIndex = IPool(pool)
            .getReserveNormalizedVariableDebt(cApe);
        uint256 _compoundFee = compoundFee;
        uint256 totalReward;
        uint256 totalDebtInterest;
        uint256 totalFee;
        uint256 positionLength = positions.length;
        for (uint256 index = 0; index < positionLength; index++) {
            VaultPosition calldata position = positions[index];
            (
                uint256 reward,
                uint256 debtInterest,
                uint256 fee
            ) = _claimAndCompound(
                    position,
                    cApeExchangeRate,
                    latestBorrowIndex,
                    _compoundFee
                );
            totalReward += reward;
            totalDebtInterest += debtInterest;
            totalFee += fee;
        }
        if (totalReward > 0) {
            IAutoCompoundApe(cApe).deposit(address(this), totalReward);
            IPool(pool).repay(cApe, totalDebtInterest, address(this));
            IERC20(apeCoin).safeTransfer(compoundBot, totalFee);
        }
    }

    function _claimAndCompound(
        VaultPosition calldata position,
        uint256 cApeExchangeRate,
        uint256 latestBorrowIndex,
        uint256 _compoundFee
    )
        internal
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        (, address apeNToken) = _getApeAndNTokenAddress(position.stakingType);

        //get reward amount
        uint256 rewardAmount;
        {
            uint256 balanceBefore = IERC20(apeCoin).balanceOf(address(this));
            if (
                position.stakingType == StakingType.BAYCStaking ||
                position.stakingType == StakingType.MAYCStaking
            ) {
                uint256[] memory _nfts = new uint256[](1);
                _nfts[0] = position.mainTokenId;
                if (position.stakingType == StakingType.BAYCStaking) {
                    apeCoinStaking.claimSelfBAYC(_nfts);
                } else {
                    apeCoinStaking.claimSelfMAYC(_nfts);
                }
            } else {
                ApeCoinStaking.PairNft[]
                    memory _nfts = new ApeCoinStaking.PairNft[](1);
                _nfts[0].mainTokenId = position.mainTokenId;
                _nfts[0].bakcTokenId = position.bakcTokenId;
                ApeCoinStaking.PairNft[]
                    memory _otherPairs = new ApeCoinStaking.PairNft[](0);
                if (position.stakingType == StakingType.BAYCPairStaking) {
                    apeCoinStaking.claimSelfBAKC(_nfts, _otherPairs);
                } else {
                    apeCoinStaking.claimSelfBAKC(_otherPairs, _nfts);
                }
            }
            uint256 balanceAfter = IERC20(apeCoin).balanceOf(address(this));
            rewardAmount = balanceAfter - balanceBefore;
        }

        // calculate debt
        uint256 debtInterest;
        {
            uint256 apePositionCap = getApeCoinStakingCap(position.stakingType);
            debtInterest = _calculateCurrentPositionDebtInterest(
                position,
                apePositionCap,
                cApeExchangeRate,
                latestBorrowIndex
            );

            //simply revert if rewardAmount < debtInterest, or it's hard to update positionCApeVariableDebtIndex
            require(rewardAmount >= debtInterest, "");
            positionCApeShareDebt[position.stakingType][
                position.mainTokenId
            ] = apePositionCap.rayDiv(latestBorrowIndex).rayDiv(
                cApeExchangeRate
            );
        }

        uint256 remainingReward = rewardAmount - debtInterest;
        uint256 feeAmount = remainingReward.percentMul(_compoundFee);
        remainingReward -= feeAmount;
        uint256 rewardShare = remainingReward.rayDiv(cApeExchangeRate);
        _depositCApeShareForUser(
            IERC721(apeNToken).ownerOf(position.mainTokenId),
            rewardShare
        );

        return (rewardAmount, debtInterest, feeAmount);
    }

    function _depositCApeShareForUser(address user, uint256 amount) internal {
        if (amount > 0) {
            cApeShareBalance[user] += amount;
        }
    }

    function getApeCoinStakingCap(StakingType stakingType)
        public
        view
        returns (uint256)
    {
        if (stakingType == StakingType.BAYCStaking) {
            return baycMatchedCap;
        } else if (stakingType == StakingType.MAYCStaking) {
            return maycMatchedCap;
        } else {
            return bakcMatchedCap;
        }
    }

    function _calculateCurrentPositionDebtInterest(
        VaultPosition calldata position,
        uint256 apePositionCap,
        uint256 cApeExchangeRate,
        uint256 latestBorrowIndex
    ) internal view returns (uint256) {
        uint256 shareDebt = positionCApeShareDebt[position.stakingType][
            position.mainTokenId
        ];
        uint256 currentDebt = shareDebt.rayMul(cApeExchangeRate).rayMul(
            latestBorrowIndex
        );
        return (currentDebt - apePositionCap);
    }

    function _handleApeTransfer(
        address apeToken,
        address apeNToken,
        uint256 tokenId
    ) internal {
        address currentOwner = IERC721(apeToken).ownerOf(tokenId);
        if (currentOwner != address(this)) {
            IERC721(apeToken).safeTransferFrom(
                apeNToken,
                address(this),
                tokenId
            );
        }
    }*/
}
