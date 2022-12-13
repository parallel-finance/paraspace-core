// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import {Ownable} from "../dependencies/openzeppelin/contracts/Ownable.sol";
import {SafeMath} from "../dependencies/openzeppelin/contracts/SafeMath.sol";
import {IERC20} from "../dependencies/openzeppelin/contracts/IERC20.sol";
import {SafeERC20} from "../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {ERC20} from "../dependencies/openzeppelin/contracts/ERC20.sol";
import {ApeCoinStaking} from "../dependencies/yoga-labs/ApeCoinStaking.sol";
import {IPool} from "../interfaces/IPool.sol";
import {IApeYield} from "../interfaces/IApeYield.sol";

contract ApeYield is Ownable, ERC20, IApeYield {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant APE_COIN_POOL_ID = 0;
    uint256 public constant APE_COIN_PRECISION = 1e18;
    uint256 public constant MIN_OPERATION_AMOUNT = 100 * APE_COIN_PRECISION;
    uint256 public constant EPOCH_LENGTH = 1 hours;
    uint256 private constant MINIMUM_LIQUIDITY = 1e9;
    uint256 internal constant ONE = 1e18; // 18 decimal places

    ApeCoinStaking public immutable apeStaking;
    IERC20 public immutable apeCoin;
    IPool public lendingPool;

    /**
     * @dev Only pool can call functions marked by this modifier.
     **/
    modifier onlyPool() {
        require(_msgSender() == address(lendingPool), "Caller must be pool");
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        address _apeCoin,
        address _apeStaking,
        address _pool
    ) ERC20(_name, _symbol) {
        apeStaking = ApeCoinStaking(_apeStaking);
        apeCoin = IERC20(_apeCoin);
        lendingPool = IPool(_pool);
        apeCoin.safeApprove(_apeStaking, type(uint256).max);
    }

    function deposit(
        address onBehalf,
        address payer,
        uint256 amount
    ) external onlyPool {
        uint256 amountShare;
        if (totalSupply() == 0) {
            amountShare = amount - MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY); // permanently lock the first MINIMUM_LIQUIDITY tokens
        } else {
            amountShare = (amount * totalSupply()) / getTotalApeBalance();
        }
        _mint(onBehalf, amountShare);

        IERC20(apeCoin).safeTransferFrom(payer, address(this), amount);
        _harvest();
        _compound();

        emit Deposit(onBehalf, amount, amountShare);
    }

    function withdraw(
        address onBehalf,
        address receiver,
        uint256 amountShare
    ) external onlyPool {
        require(amountShare > 0, "Amount Too Small");

        uint256 amountWithdraw = getApeShareBalance(amountShare);
        _burn(onBehalf, amountShare);

        _harvest();
        uint256 selfBalance = apeCoin.balanceOf(address(this));
        if (amountWithdraw > selfBalance) {
            apeStaking.withdrawSelfApeCoin(amountWithdraw - selfBalance);
        }
        apeCoin.safeTransfer(receiver, amountWithdraw);

        _compound();

        emit Redeem(onBehalf, amountShare, amountWithdraw);
    }

    function clearUserPositionAndRepay(address onBehalf) external onlyPool {
        uint256 amountShare = balanceOf(onBehalf);
        if (amountShare == 0) {
            return;
        }

        uint256 amountWithdraw = getApeShareBalance(amountShare);
        _burn(onBehalf, amountShare);

        _harvest();
        uint256 selfBalance = apeCoin.balanceOf(address(this));
        if (amountWithdraw > selfBalance) {
            apeStaking.withdrawSelfApeCoin(amountWithdraw - selfBalance);
        }

        lendingPool.repayAndSupply(
            address(apeCoin),
            onBehalf,
            0,
            amountWithdraw
        );

        _compound();
    }

    function getApeShareBalance(uint256 amountShare)
        internal
        view
        returns (uint256 apeAmount)
    {
        apeAmount = (amountShare * getTotalApeBalance()) / totalSupply();
    }

    function getApeBalanceForUser(address user)
        external
        view
        returns (uint256 apeAmount)
    {
        apeAmount = getApeShareBalance(balanceOf(user));
    }

    function getTotalApeBalance() public view returns (uint256 totalBalance) {
        (uint256 stakedAmount, ) = apeStaking.addressPosition(address(this));
        uint256 rewardAmount = apeStaking.pendingRewards(
            APE_COIN_POOL_ID,
            address(this),
            0
        );
        uint256 selfBalance = apeCoin.balanceOf(address(this));
        totalBalance = stakedAmount + rewardAmount + selfBalance;
    }

    function harvestAndCompound() external {
        _harvest();
        _compound();
    }

    function _compound() internal {
        uint256 selfBalance = apeCoin.balanceOf(address(this));
        if (selfBalance >= MIN_OPERATION_AMOUNT) {
            apeStaking.depositSelfApeCoin(selfBalance);
        }
    }

    function _harvest() internal {
        uint256 rewardAmount = apeStaking.pendingRewards(
            APE_COIN_POOL_ID,
            address(this),
            0
        );
        if (rewardAmount >= 0) {
            apeStaking.claimSelfApeCoin();
        }
    }

    function transfer(address, uint256) public virtual override returns (bool) {
        revert("not allowed");
    }

    function transferFrom(
        address,
        address,
        uint256
    ) public virtual override returns (bool) {
        revert("not allowed");
    }
}
