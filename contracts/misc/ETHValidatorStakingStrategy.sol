// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {WadRayMath} from "../protocol/libraries/math/WadRayMath.sol";
import {IACLManager} from "../interfaces/IACLManager.sol";
import {IPoolAddressesProvider} from "../interfaces/IPoolAddressesProvider.sol";
import {IETHStakingProviderStrategy} from "../interfaces/IETHStakingProviderStrategy.sol";
import {IETHWithdrawal} from "./interfaces/IETHWithdrawal.sol";
import {MathUtils} from "../protocol/libraries/math/MathUtils.sol";

contract ETHValidatorStakingStrategy is IETHStakingProviderStrategy {
    using WadRayMath for uint256;

    uint256 internal immutable STAKING_RATE;
    uint256 internal immutable SLASHING_RATE;
    uint256 internal immutable PROVIDER_PREMIUM;
    uint256 internal immutable PROVIDER_DURATION_FACTOR;

    constructor(
        uint256 stakingRate,
        uint256 slashingRate,
        uint256 providerPremium,
        uint256 providerDurationFactor
    ) {
        STAKING_RATE = stakingRate;
        SLASHING_RATE = slashingRate;
        PROVIDER_PREMIUM = providerPremium;
        PROVIDER_DURATION_FACTOR = providerDurationFactor;
    }

    function getTokenPresentValue(
        IETHWithdrawal.TokenInfo calldata tokenInfo,
        uint256 amount,
        uint256 discountRate
    ) external view returns (uint256 price) {
        if (block.timestamp >= tokenInfo.withdrawableTime) {
            return amount;
        }

        uint256 comppoundedInterestFromDiscountRate = MathUtils
            .calculateCompoundedInterest(
                discountRate,
                uint40(block.timestamp),
                tokenInfo.withdrawableTime
            );
        uint256 timeUntilRedemption = (tokenInfo.withdrawableTime -
            block.timestamp);

        // TODO finalize staking rewards calculation for partial collateral
        uint256 scaledUpStakingReward = STAKING_RATE.wadToRay() *
            timeUntilRedemption *
            WadRayMath.RAY;

        uint256 scaledPrinciple = amount.wadToRay();

        uint256 pricipleAfterSlashingRisk = scaledPrinciple -
            (scaledPrinciple * SLASHING_RATE * timeUntilRedemption) /
            (MathUtils.SECONDS_PER_YEAR * WadRayMath.RAY);

        uint256 tokenPrice = pricipleAfterSlashingRisk.rayDiv(
            comppoundedInterestFromDiscountRate
        ) +
            (scaledUpStakingReward -
                scaledUpStakingReward /
                comppoundedInterestFromDiscountRate) /
            (discountRate / MathUtils.SECONDS_PER_YEAR);

        price = tokenPrice.rayToWad();
    }

    function getDiscountRate(
        IETHWithdrawal.TokenInfo calldata tokenInfo,
        uint256 borrowRate
    ) external view returns (uint256 discountRate) {
        if (block.timestamp >= tokenInfo.withdrawableTime) {
            return PROVIDER_PREMIUM;
        }

        uint256 timeUntilRedemption = (tokenInfo.withdrawableTime -
            block.timestamp);

        // r_discount = r_base_vendor +  (borrowRate * T) / durationFactor

        return (PROVIDER_PREMIUM +
            (borrowRate * timeUntilRedemption) /
            PROVIDER_DURATION_FACTOR);
    }

    function getSlashingRate() external view returns (uint256) {
        return SLASHING_RATE;
    }

    function getStakingRate() external view returns (uint256) {
        return STAKING_RATE;
    }
}
