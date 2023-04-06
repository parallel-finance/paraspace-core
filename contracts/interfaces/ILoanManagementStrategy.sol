// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

interface ILoanManagementStrategy {
    function deposit(DataTypes.FixedTermLoanData calldata loanData) external;

    function redeem(
        DataTypes.FixedTermLoanData calldata loanData,
        uint256 shares,
        address receiver
    ) external;

    function auction(DataTypes.FixedTermLoanData calldata loanData) external;
}
