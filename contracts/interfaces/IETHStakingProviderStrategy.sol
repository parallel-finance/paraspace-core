// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import {IETHWithdrawal} from "../misc/interfaces/IETHWithdrawal.sol";

/**
 * @title IETHStakingProviderStrategy
 *
 * @notice Interface for the calculation of current eth derivative parameters
 */
interface IETHStakingProviderStrategy {
    function getTokenPresentValue(
        IETHWithdrawal.TokenInfo calldata tokenInfo,
        uint256 amount,
        uint256 discountRate
    ) external view returns (uint256 price);

    function getDiscountRate(
        IETHWithdrawal.TokenInfo calldata tokenInfo,
        uint256 borrowRate
    ) external view returns (uint256 discountRate);

    function getSlashingRate() external view returns (uint256);

    function getStakingRate() external view returns (uint256);
}
