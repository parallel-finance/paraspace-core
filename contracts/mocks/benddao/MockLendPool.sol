// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {BDaoDataTypes} from "../../dependencies/benddao/contracts/libraries/types/BDaoDataTypes.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";

contract MockLendPool {
  address weth;
  mapping(uint256 => BDaoDataTypes.LoanData) loans;
  
  mapping(address => mapping(uint256 => uint256)) loanMapping;


    constructor(address _weth) {
        weth = _weth;
    }

  function setLoan(uint256 loanId, address nftAsset, uint256 nftTokenId, address borrower, uint256 scaledAmount, BDaoDataTypes.LoanState state) external {
    loans[loanId].loanId = loanId;
    loans[loanId].nftAsset = nftAsset;
    loans[loanId].nftTokenId = nftTokenId;
    loans[loanId].borrower = borrower;
    loans[loanId].scaledAmount = scaledAmount;
    loans[loanId].state = state;
    loanMapping[nftAsset][nftTokenId] = loanId;

    IERC721(nftAsset).transferFrom(borrower, address(this), nftTokenId);
  }
  
  function getLoan(uint256 loanId) external view returns (BDaoDataTypes.LoanData memory loanData) {
    return loans[loanId];
  }

  function getLoanReserveBorrowAmount(uint256 loanId) external view returns (address, uint256) {
    return (loans[loanId].nftAsset, loans[loanId].scaledAmount);
  }

  function repay(
    address nftAsset,
    uint256 nftTokenId,
    uint256 amount
  ) external returns (uint256, bool) {
    BDaoDataTypes.LoanData storage loan = loans[loanMapping[nftAsset][nftTokenId]];

    if (amount == loan.scaledAmount) {
        IERC721(loan.nftAsset).safeTransferFrom(address(this), loan.borrower, loan.nftTokenId);
    }

    loan.state = BDaoDataTypes.LoanState.Repaid;

    IERC20(weth).transferFrom(msg.sender, address(this), amount);
  }
}