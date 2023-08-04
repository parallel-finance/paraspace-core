// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IStakefishTransactionFeePoolV2 {
    function collectReward(address payable beneficiary, uint256 amountRequested) external;
    function pendingReward(address depositorAddress) external view returns (uint256, uint256);
    receive() external payable;
}
