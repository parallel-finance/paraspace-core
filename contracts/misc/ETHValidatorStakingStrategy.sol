// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {WadRayMath} from "../protocol/libraries/math/WadRayMath.sol";
import {IACLManager} from "../interfaces/IACLManager.sol";
import {IPoolAddressesProvider} from "../interfaces/IPoolAddressesProvider.sol";
import {IETHStakingProviderStrategy} from "../interfaces/IETHStakingProviderStrategy.sol";
import {PercentageMath} from "../protocol/libraries/math/PercentageMath.sol";
import {IETHWithdrawal} from "./interfaces/IETHWithdrawal.sol";

contract ETHValidatorStakingStrategy is IETHStakingProviderStrategy {
    using PercentageMath for uint256;

    uint256 constant STAKING_RATE = 1E7; // ETH per Day
    uint256 constant PROVIDER_PREMIUM = 2500; // ~25% APY in RAY divided by 365 days
    uint256 constant DISCOUNT_RATE_SCALEDOWN_FACTOR = 50;

    function getTokenPresentValue(
        IETHWithdrawal.TokenInfo calldata tokenInfo,
        uint256 discountRate
    ) external view returns (uint256 price) {
        return
            tokenInfo.balance.percentDiv(
                PercentageMath.PERCENTAGE_FACTOR + discountRate
            ) +
            STAKING_RATE.percentDiv(
                PercentageMath.PERCENTAGE_FACTOR + discountRate
            );
    }

    function getDiscountRate(
        IETHWithdrawal.TokenInfo calldata tokenInfo,
        uint256 borrowRate
    ) external view returns (uint256 discountRate) {
        uint256 daysUntilRedemption = (tokenInfo.withdrawableTime -
            block.timestamp) / 86400;
        return
            PROVIDER_PREMIUM +
            ((PercentageMath.PERCENTAGE_FACTOR *
                ((borrowRate / 365) * daysUntilRedemption)) /
                DISCOUNT_RATE_SCALEDOWN_FACTOR) /
            WadRayMath.RAY;
    }

    function getSlashingRisk(uint256 tokenId)
        external
        view
        returns (uint256 slashingRisk)
    {
        return SLASHING_RISK;
    }

    function getStakingRate(uint256 tokenId)
        external
        view
        returns (uint256 stakingRate)
    {
        return STAKING_RATE;
    }

    function getLidoRedemptionRate(uint256 tokenId)
        internal
        view
        returns (uint256)
    {
        return WadRayMath.WAD;
    }
}
