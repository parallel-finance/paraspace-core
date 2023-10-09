// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.4;
  
import "./MulDivMath.sol";
import "./TwoPower.sol";
import "./LogPowMath.sol";

library AmountMath {

    function getAmountYUnitLiquidity_96(
        uint160 sqrtPriceL_96,
        uint160 sqrtPriceR_96,
        uint160 sqrtRate_96
    ) internal pure returns (uint256 amount_96) {
        uint160 numerator = sqrtPriceR_96 - sqrtPriceL_96;
        uint160 denominator = sqrtRate_96 - uint160(TwoPower.pow96);
        amount_96 = MulDivMath.mulDivCeil(TwoPower.pow96, numerator, denominator);
    }

    function getAmountXUnitLiquidity_96(
        int24 leftPt,
        int24 rightPt,
        uint160 sqrtPriceR_96,
        uint160 sqrtRate_96
    ) internal pure returns (uint256 amount_96) {
        // rightPt - (leftPt - 1), pc = leftPt - 1
        uint160 sqrtPricePrPc_96 = LogPowMath.getSqrtPrice(rightPt - leftPt + 1);
        uint160 sqrtPricePrPd_96 = LogPowMath.getSqrtPrice(rightPt + 1);

        uint160 numerator = sqrtPricePrPc_96 - sqrtRate_96;
        uint160 denominator = sqrtPricePrPd_96 - sqrtPriceR_96;
        amount_96 = MulDivMath.mulDivCeil(TwoPower.pow96, numerator, denominator);
    }

}
