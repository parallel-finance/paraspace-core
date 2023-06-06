// SPDX-License-Identifier: Unlicensed

pragma solidity ^0.8.17;
pragma abicoder v2;

import '../../openzeppelin/upgradeability/IERC20Upgradeable.sol';

interface IWETHUpgradable is IERC20Upgradeable {
    function deposit() external payable;

    function withdraw(uint256 wad) external;
}