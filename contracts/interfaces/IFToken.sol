// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

interface IFToken {
    function mint(
        address recipient,
        DataTypes.FixedTermLoanData calldata loanData
    ) external returns (uint256 tokenId);
}
