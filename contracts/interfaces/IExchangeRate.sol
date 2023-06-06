// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IExchangeRate {
    function getExchangeRate() external view returns (uint256);
}
