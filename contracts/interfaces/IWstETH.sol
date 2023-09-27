// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IWstETH {
    function wrap(uint256 _stETHAmount) external returns (uint256);

    function unwrap(uint256 _wstETHAmount) external returns (uint256);
}
