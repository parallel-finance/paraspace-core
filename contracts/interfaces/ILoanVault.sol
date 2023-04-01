// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

/**
 * @title ILoanVault
 *
 * @notice Defines the basic interface for an LoanVault contract.
 **/
interface ILoanVault {
    function transferCollateral(
        address collateralAsset,
        uint256 collateralTokenId,
        uint256 collateralAmount,
        address to
    ) external;

    function settleCollateral(
        address collateralAsset,
        uint256 collateralTokenId,
        uint256 collateralAmount
    ) external;

    function swapETHToDerivativeAsset(address asset, uint256 amount) external;
}
