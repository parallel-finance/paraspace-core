// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

interface ILoanParametersStrategy {
    function calculateInterestRate(
        DataTypes.FixedTermLoanParams calldata loanParams
    ) external view returns (uint256);

    function calculateMaxLoanToValue(
        DataTypes.FixedTermLoanParams calldata loanParams
    ) external view returns (uint256);

    function getCurrentAssetPrice(
        DataTypes.FixedTermLoanParams calldata loanParams
    ) external view returns (uint256);

    function getLoanTermRange(DataTypes.FixedTermLoanParams calldata loanParams)
        external
        view
        returns (uint256 minTerm, uint256 maxTerm);

    function calculateLoanParameters(
        DataTypes.FixedTermLoanParams calldata loanParams
    ) external returns (uint256 maxLTV, uint256 interestRate);

    function validateLoan(DataTypes.FixedTermLoanParams calldata loanParams)
        external
        returns (bool);
}
