pragma solidity ^0.8.0;

import {IPoolCore} from "contracts/interfaces/IPoolCore.sol";
import {IERC20WithPermit} from "contracts/interfaces/IERC20WithPermit.sol";

import {PTest} from "@pwnednomore/contracts/PTest.sol";

import "forge-std/console.sol";


contract FundLossTest is PTest {
    IPoolCore pool = IPoolCore(0xD496950582236b5E0DAE7fA13acc018492bE9c29);
    IERC20WithPermit dai = IERC20WithPermit(0x024f245F740667fF208068d593E4C7f8f26416f2);
    uint256 initFund = 1 ether;

    address user = address(0x1);

    function setUp() external {
        vm.createSelectFork(
            "https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161"
        );

        user = getAgent();
        deal(address(dai), user, initFund);
        console.log("DAI balance when setup: %s", dai.balanceOf(user));

        vm.startPrank(user);
        dai.approve(address(pool), type(uint256).max);
        pool.supply(address(dai), initFund, address(user), 0);
        vm.stopPrank();
    }

    function invariantFundLoss() public {
        vm.startPrank(user);
        pool.withdraw(address(dai), initFund * 95 / 100, user);
        require(dai.balanceOf(user) >= initFund * 95 / 100);
        vm.stopPrank();

        console.log("DAI balance at the end: %s", dai.balanceOf(user));
    }

    function testFundLoss() external {
        console.logBytes(address(0xeE45cAB7495Ab8057b956b42487A5e333A5b7081).code);
        invariantFundLoss();
    }
}
