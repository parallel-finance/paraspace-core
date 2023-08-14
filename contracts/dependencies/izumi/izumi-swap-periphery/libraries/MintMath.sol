// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.4;

import "./TwoPower.sol";
import "./AmountMath.sol";

library MintMath {

    struct MintMathParam {
        int24 pl;
        int24 pr;
        uint128 xLim;
        uint128 yLim;
    }

    /// @dev [pl, pr)
    function _computeDepositXYPerUnit(
        int24 pl,
        int24 pr,
        int24 pc,
        uint160 sqrtPrice_96,
        uint160 sqrtRate_96
    ) private pure returns (uint256 x, uint256 y) {
        x = 0;
        y = 0;
        uint160 sqrtPriceR_96 = LogPowMath.getSqrtPrice(pr);
        if (pl < pc) {
            uint160 sqrtPriceL_96 = LogPowMath.getSqrtPrice(pl);
            if (pr < pc) {
                y += AmountMath.getAmountYUnitLiquidity_96(sqrtPriceL_96, sqrtPriceR_96, sqrtRate_96);
            } else {
                y += AmountMath.getAmountYUnitLiquidity_96(sqrtPriceL_96, sqrtPrice_96, sqrtRate_96);
            }
        }
        if (pr > pc) {
            // we need compute XR
            int24 xrLeft = (pl > pc) ? pl : pc + 1;
            x = AmountMath.getAmountXUnitLiquidity_96(
                xrLeft,
                pr,
                sqrtPriceR_96,
                sqrtRate_96
            );
        }
        if (pl <= pc && pr > pc) {
            // we nned compute yc at point of current price
            y += sqrtPrice_96;
        }
    }

    function computeLiquidity(
        MintMathParam memory mp, int24 currPt, uint160 sqrtPrice_96, uint160 sqrtRate_96
    ) internal pure returns(uint128 liquidity) {
        liquidity = type(uint128).max / 2;
        (uint256 x, uint256 y) = _computeDepositXYPerUnit(mp.pl, mp.pr, currPt, sqrtPrice_96, sqrtRate_96);
        if (x > 0) {
            uint256 xl = uint256(mp.xLim) * TwoPower.pow96 / x;
            if (liquidity > xl) {
                liquidity = uint128(xl);
            }
        }
        if (y > 0) {
            // we take yLim - 1, because in the core, the amountY to deposit is
            // calculated by range [left, pc) and point at pc respectively
            uint256 yl = uint256(mp.yLim - 1) * TwoPower.pow96 / y;
            if (liquidity > yl) {
                liquidity = uint128(yl);
            }
        }
    }

}