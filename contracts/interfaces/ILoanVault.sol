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
        address to
    ) external;

    function settleCollateral(
        address collateralAsset,
        uint256 collateralTokenId
    ) external;

    function convertETHToAsset(address asset, uint256 amount) external;
}
