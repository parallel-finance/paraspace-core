// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import {IETHWithdrawal} from "../misc/interfaces/IETHWithdrawal.sol";

/**

@title IETHStakingProviderStrategy

@dev Interface for a staking provider strategy that determines staking and slashing rates and calculates token values
*/
interface IETHStakingProviderStrategy {
    /**

@dev Calculates the present value of a given token
@param tokenInfo Information about the token being evaluated
@param amount The amount of tokens being evaluated
@param discountRate The discount rate to be applied
@return price present value of the given token
*/
    function getTokenPresentValue(
        IETHWithdrawal.TokenInfo calldata tokenInfo,
        uint256 amount,
        uint256 discountRate
    ) external view returns (uint256 price);

    /**

@dev Calculates the discount rate for a given token and borrow rate
@param tokenInfo Information about the token being evaluated
@param borrowRate The borrow rate to be used in the calculation
@return discountRate discount rate for the given token and borrow rate
*/
    function getDiscountRate(
        IETHWithdrawal.TokenInfo calldata tokenInfo,
        uint256 borrowRate
    ) external view returns (uint256 discountRate);

    /**

@dev Retrieves the current slashing rate
@return The current slashing rate
*/
    function getSlashingRate() external view returns (uint256);

    /**

@dev Retrieves the current staking rate
@return The current staking rate
*/
    function getStakingRate() external view returns (uint256);
}
