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

    constructor(
        uint256 stakingRate,
        uint256 slashingRate,
        uint256 providerPremium
    ) {
        STAKING_RATE = stakingRate;
        SLASHING_RATE = slashingRate;
        PROVIDER_PREMIUM = providerPremium;
    }

    function getTokenPresentValue(
        IETHWithdrawal.TokenInfo calldata tokenInfo,
        uint256 amount,
        uint256 discountRate
    ) external view returns (uint256 price) {
        if (block.timestamp >= tokenInfo.withdrawableTime) {
            return amount;
        }
        uint256 index = MathUtils.calculateCompoundedInterest(
            discountRate,
            uint40(block.timestamp),
            tokenInfo.withdrawableTime
        );
        return amount.rayDiv(index);
    }

    function getDiscountRate(
        IETHWithdrawal.TokenInfo calldata,
        uint256 borrowRate
    ) external pure returns (uint256 discountRate) {
        // TODO: finalize the formula
        discountRate = borrowRate;
    }

    function getSlashingRate() external view returns (uint256) {
        return SLASHING_RATE;
    }

    function getStakingRate() external view returns (uint256) {
        return STAKING_RATE;
    }
}
