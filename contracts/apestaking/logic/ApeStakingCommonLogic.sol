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
import "hardhat/console.sol";

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
        uint256 positionCap
    ) internal returns (uint256, uint256) {
        uint256 cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
        uint256 latestBorrowIndex = IPool(vars.pool)
            .getReserveNormalizedVariableDebt(vars.cApe);
        uint256 cApeDebtShare = poolState.cApeDebtShare;
        uint256 debtInterest = calculateCurrentPositionDebtInterest(
            cApeDebtShare,
            poolState.stakingPosition,
            positionCap,
            cApeExchangeRate,
            latestBorrowIndex
        );
        console.log(
            "calculateRepayAndCompound-----------vars.totalClaimedApe:",
            vars.totalClaimedApe
        );
        console.log(
            "calculateRepayAndCompound-----------debtInterest:",
            debtInterest
        );
        if (debtInterest >= vars.totalClaimedApe) {
            cApeDebtShare -= vars
                .totalClaimedApe
                .rayDiv(latestBorrowIndex)
                .rayDiv(cApeExchangeRate);
            poolState.cApeDebtShare = cApeDebtShare;
            return (vars.totalClaimedApe, 0);
        } else {
            //repay debt
            cApeDebtShare -= debtInterest.rayDiv(latestBorrowIndex).rayDiv(
                cApeExchangeRate
            );
            poolState.cApeDebtShare = cApeDebtShare;

            uint256 shareRewardAmount = (vars.totalClaimedApe - debtInterest)
                .rayDiv(cApeExchangeRate);
            uint256 compoundFee = shareRewardAmount.percentMul(
                vars.compoundFee
            );
            console.log(
                "calculateRepayAndCompound-----------vars.compoundFee:",
                vars.compoundFee
            );
            console.log(
                "calculateRepayAndCompound-----------compoundFee:",
                compoundFee
            );
            shareRewardAmount = shareRewardAmount - compoundFee;
            //update reward index
            uint128 currentTotalPosition = poolState.totalPosition;
            if (currentTotalPosition != 0) {
                poolState.accumulatedRewardsPerNft +=
                    shareRewardAmount.toUint128() /
                    currentTotalPosition;
            }
            return (debtInterest, compoundFee);
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
