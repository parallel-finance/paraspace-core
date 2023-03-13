// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import {IPoolAddressesProvider} from "./IPoolAddressesProvider.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

/**
 * @title IPoolInstantWithdraw
 *
 * @notice Defines the basic interface for an ParaSpace Instant Withdraw.
 **/
interface IPoolInstantWithdraw {
    /**
     * @dev Emitted when the value of loan creation fee rate update
     **/
    event LoanCreationFeeRateUpdated(uint256 oldValue, uint256 newValue);

    /**
     * @dev Emitted when a loan is created
     * @param user The address of the user who created the loan
     * @param loanId The Id of the loan
     * @param collateralAsset The collateral asset of the loan
     * @param collateralTokenId The collateral token Id of the loan
     * @param collateralAmount The collateral token amount of the loan
     * @param borrowAsset The borrow asset token address of the loan
     * @param borrowAmount The borrow amount of the loan
     * @param discountRate The discount rate of the collateral asset when created the loan
     */
    event LoanCreated(
        address indexed user,
        uint256 indexed loanId,
        address collateralAsset,
        uint256 collateralTokenId,
        uint256 collateralAmount,
        address borrowAsset,
        uint256 borrowAmount,
        uint256 discountRate
    );

    /**
     * @dev Emitted when a loan's collateral was swapped by user
     * @param user The address swapped the collateral
     * @param loanId The Id of the loan
     * @param swapAsset The asset token address for the swap
     * @param swapAmount The token amount for the swap
     */
    event LoanCollateralSwapped(
        address indexed user,
        uint256 indexed loanId,
        address swapAsset,
        uint256 swapAmount
    );

    /**
     * @dev Emitted when a loan is repaid by the borrower
     * @param loanId The Id of the loan
     * @param settler The address settled the loan
     * @param repayAsset The repay asset token address
     * @param repayAmount The repay token amount
     */
    event LoanSettled(
        uint256 indexed loanId,
        address settler,
        address repayAsset,
        uint256 repayAmount
    );

    /**
     * @notice add borrowable asset list for the specified collateral asset
     * @dev Only callable by asset listing or pool admin
     * @param collateralAsset The address of the collateral asset
     * @param borrowAssets The address array of the borrowable asset list
     **/
    function addBorrowableAssets(
        address collateralAsset,
        address[] calldata borrowAssets
    ) external;

    /**
     * @notice remove borrowable asset list for a specified collateral asset
     * @dev Only callable by asset listing or pool admin
     * @param collateralAsset The address of the collateral asset
     * @param borrowAssets The address array of the borrowable asset list
     **/
    function removeBorrowableAssets(
        address collateralAsset,
        address[] calldata borrowAssets
    ) external;

    /**
     * @notice update fee rate for creating loan
     * @dev Only callable by asset listing or pool admin
     * @param feeRate new fee rate
     **/
    function setLoanCreationFeeRate(uint256 feeRate) external;

    /**
     * @notice get fee rate for creating loan
     * @return fee rate for creating loan
     **/
    function getLoanCreationFeeRate() external view returns (uint256);

    /**
     * @notice get borrowable asset list for the specified collateral asset
     * @param collateralAsset The address of the collateral asset
     **/
    function getBorrowableAssets(address collateralAsset)
        external
        view
        returns (address[] memory);

    /**
     * @notice get loan id list for the specified user address
     * @param user The address of the specified user
     **/
    function getUserLoanIdList(address user)
        external
        view
        returns (uint256[] memory);

    /**
     * @notice get detail loan info for the specified loan id
     **/
    function getLoanInfo(uint256 loanId)
        external
        view
        returns (DataTypes.TermLoanData memory);

    /**
     * @notice get current present value of the specified loan's collateral asset
     **/
    function getLoanCollateralPresentValue(uint256 loanId)
        external
        view
        returns (uint256);

    /**
     * @notice get current debt value of the specified loan
     **/
    function getLoanDebtValue(uint256 loanId) external view returns (uint256);

    /**
     * @notice create a term loan with the specified collateral asset
     * @param collateralAsset The address of the collateral asset
     * @param collateralTokenId The token id of the collateral asset
     * @param collateralAmount The collateral token amount of the loan
     * @param borrowAsset The address of the asset user wanted to borrow
     * @return the loan's borrow amount
     **/
    function createLoan(
        address collateralAsset,
        uint256 collateralTokenId,
        uint256 collateralAmount,
        address borrowAsset,
        uint16 referralCode
    ) external returns (uint256);

    /**
     * @notice swap a term loan collateral with the loan's borrow asset,
     * the amount user need to pay is calculated by the present value of the collateral
     * @param loanId The id for the specified loan
     * @param receiver The address to receive the collateral asset
     **/
    function swapLoanCollateral(uint256 loanId, address receiver) external;

    /**
     * @notice settle a term loan collateral, The collateral asset will be
      redeem as ETH to repay loan's debt
     * @param loanId The id for the specified loan
     **/
    function settleTermLoan(uint256 loanId) external;
}
