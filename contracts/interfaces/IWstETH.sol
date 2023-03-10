// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

interface IWstETH {
    function stETH() external returns (address);

    function wrap(uint256 _stETHAmount) external returns (uint256);
}
