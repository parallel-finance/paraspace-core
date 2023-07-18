// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import "../../interfaces/IParaApeStaking.sol";
import {PercentageMath} from "../../protocol/libraries/math/PercentageMath.sol";
import "../../interfaces/IAutoCompoundApe.sol";
import "../../interfaces/ICApe.sol";
import "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {WadRayMath} from "../../protocol/libraries/math/WadRayMath.sol";
import {IPool} from "../../interfaces/IPool.sol";
import "../../protocol/libraries/helpers/Errors.sol";

/**
 * @title ApeStakingVaultLogic library
 *
 * @notice Implements the base logic for ape staking vault
 */
library ApeStakingCommonLogic {
    using PercentageMath for uint256;
    using SafeCast for uint256;
    using WadRayMath for uint256;

    function validateTokenIdArray(uint32[] calldata tokenIds) internal pure {
        uint256 arrayLength = tokenIds.length;
        require(arrayLength > 0, Errors.INVALID_PARAMETER);
        if (arrayLength >= 2) {
            for (uint256 index = 1; index < arrayLength; index++) {
                require(
                    tokenIds[index] > tokenIds[index - 1],
                    Errors.INVALID_PARAMETER
                );
            }
        }
    }

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
        uint256 positionCap
    ) internal returns (uint256, uint256) {
        uint256 cApeDebtShare = poolState.cApeDebtShare;
        uint256 debtInterest = calculateCurrentPositionDebtInterest(
            cApeDebtShare,
            poolState.stakingPosition,
            positionCap,
            vars.cApeExchangeRate,
            vars.latestBorrowIndex
        );
        uint256 repayAmount = (debtInterest >= vars.totalClaimedApe)
            ? vars.totalClaimedApe
            : debtInterest;
        cApeDebtShare -= repayAmount.rayDiv(vars.latestBorrowIndex).rayDiv(
            vars.cApeExchangeRate
        );
        poolState.cApeDebtShare = cApeDebtShare.toUint104();
        uint256 compoundFee = 0;
        if (vars.totalClaimedApe > debtInterest) {
            uint256 shareRewardAmount = (vars.totalClaimedApe - debtInterest)
                .rayDiv(vars.cApeExchangeRate);
            compoundFee = shareRewardAmount.percentMul(vars.compoundFee);
            shareRewardAmount -= compoundFee;
            //update reward index
            uint104 currentTotalPosition = poolState.totalPosition;
            if (currentTotalPosition != 0) {
                poolState.accumulatedRewardsPerNft +=
                    shareRewardAmount.toUint104() /
                    currentTotalPosition;
            } else {
                compoundFee += shareRewardAmount;
            }
        }

        return (repayAmount, compoundFee);
    }

    function borrowCApeFromPool(
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        uint256 totalBorrow
    ) internal returns (uint256) {
        uint256 latestBorrowIndex = IPool(vars.pool).borrowPoolCApe(
            totalBorrow
        );
        IAutoCompoundApe(vars.cApe).withdraw(totalBorrow);
        uint256 cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
        return totalBorrow.rayDiv(latestBorrowIndex).rayDiv(cApeExchangeRate);
    }

    function calculateCurrentPositionDebtInterest(
        uint256 cApeDebtShare,
        uint256 currentStakingPosition,
        uint256 perPositionCap,
        uint256 cApeExchangeRate,
        uint256 latestBorrowIndex
    ) internal pure returns (uint256) {
        uint256 currentDebt = cApeDebtShare.rayMul(cApeExchangeRate).rayMul(
            latestBorrowIndex
        );
        return (currentDebt - perPositionCap * currentStakingPosition);
    }
}
