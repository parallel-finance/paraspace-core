// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.17;

interface IToken {
    function balanceOf(address) external view returns (uint256);

    function totalSupply() external view returns (uint256);
}
