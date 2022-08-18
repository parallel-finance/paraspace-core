// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

interface IToken {
    function balanceOf(address) external view virtual returns (uint256);

    function totalSupply() external view virtual returns (uint256);
}
