// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import {Ownable} from "../dependencies/openzeppelin/contracts/Ownable.sol";
import {SafeMath} from "../dependencies/openzeppelin/contracts/SafeMath.sol";
import {IERC20} from "../dependencies/openzeppelin/contracts/IERC20.sol";
import {SafeERC20} from "../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {ApeCoinStaking} from "../dependencies/yoga-labs/ApeCoinStaking.sol";
import {IApeYield} from "../interfaces/IApeYield.sol";
import {PsAPE} from "./PsAPE.sol";

contract ApeYield is Ownable, PsAPE, IApeYield {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant APE_COIN_POOL_ID = 0;
    uint256 public constant APE_COIN_PRECISION = 1e18;
    uint256 public constant MIN_OPERATION_AMOUNT = 100 * APE_COIN_PRECISION;
    ApeCoinStaking public immutable apeStaking;
    IERC20 public immutable apeCoin;
    uint256 public backedBalance;

    constructor(address _apeCoin, address _apeStaking) {
        apeStaking = ApeCoinStaking(_apeStaking);
        apeCoin = IERC20(_apeCoin);
        apeCoin.safeApprove(_apeStaking, type(uint256).max);
    }

    function deposit(address onBehalf, uint256 amount) external override {
        require(amount > 0, "zero amount");
        uint256 amountShare = getShareByPooledApe(amount);
        if (amountShare == 0) {
            amountShare = amount;
        }
        _mint(onBehalf, amountShare);

        _transferTokenIn(msg.sender, amount);
        _harvest();
        _yield();

        emit Deposit(msg.sender, onBehalf, amount, amountShare);
    }

    function withdraw(uint256 amountShare) external override {
        require(amountShare > 0, "zero amount");

        uint256 amountWithdraw = getPooledApeByShares(amountShare);
        _burn(msg.sender, amountShare);

        _harvest();
        uint256 _backedBalance = backedBalance;
        if (amountWithdraw > _backedBalance) {
            _withdrawFromApeCoinStaking(amountWithdraw - _backedBalance);
        }
        _transferTokenOut(msg.sender, amountWithdraw);

        _yield();

        emit Redeem(msg.sender, amountShare, amountWithdraw);
    }

    function harvestAndYield() external {
        _harvest();
        _yield();
    }

    function _getTotalPooledApeBalance()
        internal
        view
        override
        returns (uint256)
    {
        (uint256 stakedAmount, ) = apeStaking.addressPosition(address(this));
        uint256 rewardAmount = apeStaking.pendingRewards(
            APE_COIN_POOL_ID,
            address(this),
            0
        );
        return stakedAmount + rewardAmount + backedBalance;
    }

    function _withdrawFromApeCoinStaking(uint256 amount) internal {
        uint256 balanceBefore = apeCoin.balanceOf(address(this));
        apeStaking.withdrawSelfApeCoin(amount);
        uint256 balanceAfter = apeCoin.balanceOf(address(this));
        uint256 realWithdraw = balanceAfter - balanceBefore;
        backedBalance += realWithdraw;
    }

    function _transferTokenIn(address from, uint256 amount) internal {
        apeCoin.safeTransferFrom(from, address(this), amount);
        backedBalance += amount;
    }

    function _transferTokenOut(address to, uint256 amount) internal {
        apeCoin.safeTransfer(to, amount);
        backedBalance -= amount;
    }

    function _yield() internal {
        uint256 _backedBalance = backedBalance;
        if (_backedBalance >= MIN_OPERATION_AMOUNT) {
            apeStaking.depositSelfApeCoin(_backedBalance);
            backedBalance = 0;
        }
    }

    function _harvest() internal {
        uint256 rewardAmount = apeStaking.pendingRewards(
            APE_COIN_POOL_ID,
            address(this),
            0
        );
        if (rewardAmount > 0) {
            apeStaking.claimSelfApeCoin();
            backedBalance += rewardAmount;
        }
    }

    function rescueERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
        if (token == address(apeCoin)) {
            require(backedBalance <= apeCoin.balanceOf(address(this)), "balance below backed balance");
        }
        emit RescueERC20(token, to, amount);
    }
}
