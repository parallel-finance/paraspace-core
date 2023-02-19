// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../dependencies/openzeppelin/upgradeability/Initializable.sol";
import "../dependencies/openzeppelin/upgradeability/OwnableUpgradeable.sol";
import "../dependencies/openzeppelin/upgradeability/ERC20Upgradeable.sol";
import "../dependencies/openzeppelin/contracts/IERC20.sol";
import "../dependencies/openzeppelin/contracts/SafeERC20.sol";
import "../dependencies/openzeppelin/contracts/Address.sol";
import "../dependencies/univ3/interfaces/ISwapRouter.sol";
import "../dependencies/yoga-labs/ApeCoinStaking.sol";
import "../interfaces/IAutoYieldApe.sol";
import "../interfaces/IYieldInfo.sol";
import "../interfaces/IPoolCore.sol";
import "../protocol/libraries/math/WadRayMath.sol";
import "../protocol/libraries/math/PercentageMath.sol";

contract AutoYieldApe is
    Initializable,
    OwnableUpgradeable,
    ERC20Upgradeable,
    IAutoYieldApe,
    IYieldInfo
{
    using PercentageMath for uint256;
    using WadRayMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address;

    /// @notice ApeCoin single pool POOL_ID for ApeCoinStaking
    uint256 internal constant APE_COIN_POOL_ID = 0;
    uint256 internal constant RAY = 1e27;

    ApeCoinStaking private immutable _apeStaking;
    address private immutable _apeCoin;
    address private immutable _yieldUnderlying;
    address private immutable _yieldToken;
    IPoolCore private immutable _lendingPool;
    ISwapRouter private immutable _swapRouter;

    //Accumulator of the total settled yield index since the opening of the pool
    uint256 private _poolSettledYieldIndex;
    //Accumulator of the latest yield rate since the opening of the pool
    uint256 private _poolLatestYieldIndex;
    //Record of calculated yield index for each user account
    mapping(address => uint256) private _userYieldIndex;
    //Record of pending yield for each user account,
    mapping(address => uint256) private _userPendingYield;
    //Record of settled yield for each user account,
    mapping(address => uint256) private _userSettledYield;
    /// @notice This account is the only role who can perform harvest action.
    address public harvestOperator;
    /// @notice The pool's fee rate for harvest operation. Expressed in bps, a value of 30 results in 0.3%
    uint256 public harvestFeeRate;

    constructor(
        address apeStaking,
        address apeCoin,
        address yieldUnderlying,
        address lendingPool,
        address swapRouter
    ) {
        _apeStaking = ApeCoinStaking(apeStaking);
        _apeCoin = apeCoin;
        _yieldUnderlying = yieldUnderlying;
        _lendingPool = IPoolCore(lendingPool);
        _yieldToken = _lendingPool
            .getReserveData(_yieldUnderlying)
            .xTokenAddress;
        require(
            _yieldToken != address(0),
            "unsupported yield underlying token"
        );
        _swapRouter = ISwapRouter(swapRouter);
    }

    function initialize() public initializer {
        __Ownable_init();
        __ERC20_init("ParaSpace Auto Yield APE", "yAPE");

        //approve ApeCoin for apeCoinStaking
        uint256 allowance = IERC20(_apeCoin).allowance(
            address(this),
            address(_apeStaking)
        );
        if (allowance == 0) {
            IERC20(_apeCoin).safeApprove(
                address(_apeStaking),
                type(uint256).max
            );
        }
        //approve _yieldUnderlying for lending pool
        allowance = IERC20(_yieldUnderlying).allowance(
            address(this),
            address(_lendingPool)
        );
        if (allowance == 0) {
            IERC20(_yieldUnderlying).safeApprove(
                address(_lendingPool),
                type(uint256).max
            );
        }
        //approve ApeCoin for uniswap
        allowance = IERC20(_apeCoin).allowance(
            address(this),
            address(_swapRouter)
        );
        if (allowance == 0) {
            IERC20(_apeCoin).safeApprove(
                address(_swapRouter),
                type(uint256).max
            );
        }
    }

    /// @inheritdoc IAutoYieldApe
    function deposit(address onBehalf, uint256 amount) external override {
        require(amount > 0, "zero amount");
        _updateYieldIndex(onBehalf, int256(amount));
        _mint(onBehalf, amount);

        IERC20(_apeCoin).safeTransferFrom(msg.sender, address(this), amount);
        _apeStaking.depositSelfApeCoin(amount);

        emit Deposit(msg.sender, onBehalf, amount);
    }

    /// @inheritdoc IAutoYieldApe
    function withdraw(uint256 amount) external override {
        _withdraw(amount);
    }

    /// @inheritdoc IAutoYieldApe
    function claimFor(address account) external override {
        _updateYieldIndex(account, 0);
        _claimFor(account);
    }

    /// @inheritdoc IAutoYieldApe
    function exit() external override {
        _withdraw(balanceOf(msg.sender));
        _claimFor(msg.sender);
    }

    /// @inheritdoc IAutoYieldApe
    function harvest(uint256 minimumDealPrice) external override {
        require(msg.sender == harvestOperator, "non harvest operator");
        _harvest(minimumDealPrice);
    }

    /// @inheritdoc IAutoYieldApe
    function yieldAmount(address account)
        external
        view
        override
        returns (uint256)
    {
        uint256 userBalance = balanceOf(account);
        uint256 pendingYield = _userPendingYield[account];
        if (userBalance > 0) {
            //index_diff = pool_latest_yield_index - user_yield_index
            //accrued_yield = user_balance * index_diff
            //lock_index_diff = pool_latest_yield_index - pool_settled_yield_index
            //locked_yield = user_balance * index_diff
            //total_pending_yield = pending_yield + accrued_yield - locked_yield
            uint256 userIndex = _userYieldIndex[account];
            uint256 poolSettledIndex = _poolSettledYieldIndex;
            uint256 poolLatestIndex = _poolLatestYieldIndex;
            uint256 indexDiff = poolLatestIndex - userIndex;
            if (indexDiff > 0) {
                uint256 accruedYield = (userBalance * indexDiff) / RAY;
                pendingYield += accruedYield;
            }
            indexDiff = _poolLatestYieldIndex - poolSettledIndex;
            if (indexDiff > 0) {
                uint256 lockedYield = (userBalance * indexDiff) / RAY;
                if (pendingYield > lockedYield) {
                    pendingYield -= lockedYield;
                } else {
                    pendingYield = 0;
                }
            }
        }

        //total_yield = total_pending_yield + settled_yield
        uint256 totalYield = _userSettledYield[account] + pendingYield;
        if (totalYield > 0) {
            uint256 liquidityIndex = _lendingPool.getReserveNormalizedIncome(
                _yieldUnderlying
            );
            //scaled_yield_amount = total_yield * liquidity_index
            totalYield = totalYield.rayMul(liquidityIndex);
        }

        return totalYield;
    }

    /// @inheritdoc IYieldInfo
    function yieldIndex() external view override returns (uint256, uint256) {
        return (_poolSettledYieldIndex, _poolLatestYieldIndex);
    }

    /// @inheritdoc IYieldInfo
    function yieldToken() external view override returns (address, address) {
        return (_yieldUnderlying, _yieldToken);
    }

    /**
     * @notice Set a new address for harvest role. Only owner can call this function
     * @param _harvestOperator The address of the harvest role
     **/
    function setHarvestOperator(address _harvestOperator) external onlyOwner {
        require(_harvestOperator != address(0), "zero address");
        address oldOperator = harvestOperator;
        if (oldOperator != _harvestOperator) {
            harvestOperator = _harvestOperator;
            emit HarvestOperatorUpdated(oldOperator, _harvestOperator);
        }
    }

    /**
     * @notice Set a new harvest fee rate. Only owner can call this function
     * @param _harvestFeeRate The new fee rate for harvest. Expressed in bps, a value of 30 results in 0.3%
     **/
    function setHarvestFeeRate(uint256 _harvestFeeRate) external onlyOwner {
        require(
            _harvestFeeRate < PercentageMath.HALF_PERCENTAGE_FACTOR,
            "Fee Too High"
        );
        uint256 oldValue = harvestFeeRate;
        if (oldValue != _harvestFeeRate) {
            harvestFeeRate = _harvestFeeRate;
            emit HarvestFeeRateUpdated(oldValue, _harvestFeeRate);
        }
    }

    /**
     * @notice Rescue erc20 from this contract address. Only owner can call this function
     * @param token The token address to be rescued, _yieldToken cannot be rescued.
     * @param to The account address to receive token
     * @param amount The amount to be rescued
     **/
    function rescueERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(token != address(_yieldToken), "cannot rescue yield token");
        IERC20(token).safeTransfer(to, amount);
        emit RescueERC20(token, to, amount);
    }

    /**
     * @notice implementation for withdraw function.
     * @param amount The amount of ape to be withdraw
     **/
    function _withdraw(uint256 amount) internal {
        require(amount > 0, "zero amount");

        _updateYieldIndex(msg.sender, -int256(amount));
        _burn(msg.sender, amount);

        _apeStaking.withdrawSelfApeCoin(amount);
        IERC20(_apeCoin).safeTransfer(msg.sender, amount);

        emit Redeem(msg.sender, amount);
    }

    /**
     * @notice implementation for claimFor function.
     **/
    function _claimFor(address account) internal {
        uint256 settledYield = _userSettledYield[account];
        if (settledYield > 0) {
            _userSettledYield[account] = 0;

            uint256 liquidityIndex = _lendingPool.getReserveNormalizedIncome(
                _yieldUnderlying
            );
            uint256 scaledYield = settledYield.rayMul(liquidityIndex);
            IERC20(_yieldToken).safeTransfer(account, scaledYield);

            emit YieldClaimed(msg.sender, account, scaledYield);
        }
    }

    /**
     * @notice implementation for harvest function.
     **/
    function _harvest(uint256 minimumDealPrice) internal {
        //1, get current pending ape coin reward amount from ApeCoinStaking
        uint256 rewardAmount = _apeStaking.pendingRewards(
            APE_COIN_POOL_ID,
            address(this),
            0
        );
        if (rewardAmount > 0) {
            //2, claim pending ape coin reward
            _apeStaking.claimSelfApeCoin();

            //3, sell ape coin to usdc
            uint256 yieldUnderlyingAmount = _sellApeCoinForUnderlyingYieldToken(
                rewardAmount,
                minimumDealPrice
            );

            //4, supply usdc to pUsdc
            IPoolCore(_lendingPool).supply(
                _yieldUnderlying,
                yieldUnderlyingAmount,
                address(this),
                0
            );

            //5, calculate yield token amount
            //yield_amount = underlying_yield_amount / pool_liquidity_index
            uint256 liquidityIndex = _lendingPool.getReserveNormalizedIncome(
                _yieldUnderlying
            );
            uint256 _yieldAmount = yieldUnderlyingAmount.rayDiv(liquidityIndex);

            //6, calculate harvest fee and subtracting harvest fee from yield amount
            //harvest_fee = yield_amount * harvest_fee_rate
            //new_yield_amount = yield_amount - harvest_fee
            uint256 _harvestFeeRate = harvestFeeRate;
            if (_harvestFeeRate > 0) {
                uint256 fee = _yieldAmount.percentMul(_harvestFeeRate);
                _userSettledYield[owner()] += fee;
                _yieldAmount -= fee;
            }

            //7, update pool yield index.
            //accrued_index = new_yield_amount / total_supply
            //new_pool_settle_yield_index = pool_latest_yield_index
            //new_pool_latest_yield_index = pool_latest_yield_index + accrued_index
            uint256 accruedIndex = (_yieldAmount * RAY) / totalSupply();
            uint256 latestYieldIndex = _poolLatestYieldIndex;
            _poolSettledYieldIndex = latestYieldIndex;
            _poolLatestYieldIndex = latestYieldIndex + accruedIndex;
        }
    }

    /**
     * @notice update user yield index to _poolSettledYieldIndex and accrue pending yield for user
     * This function need to be called when user yApe balance changed and claimed all user yield
     **/
    function _updateYieldIndex(address account, int256 balanceDiff) internal {
        uint256 userBalance = balanceOf(account);
        uint256 latestYieldIndex = _poolLatestYieldIndex;
        uint256 indexDiff = latestYieldIndex - _userYieldIndex[account];
        uint256 pendingYield = _userPendingYield[account];
        if (indexDiff > 0) {
            if (userBalance > 0) {
                uint256 accruedYield = (userBalance * indexDiff) / RAY;
                pendingYield += accruedYield;
            }
            _userYieldIndex[account] = latestYieldIndex;
        }

        uint256 lockIndexDiff = latestYieldIndex - _poolSettledYieldIndex;
        uint256 lockedYield = (userBalance * lockIndexDiff) / RAY;
        if (balanceDiff >= 0) {
            if (pendingYield > lockedYield) {
                _userSettledYield[account] += (pendingYield - lockedYield);
                _userPendingYield[account] = lockedYield;
            } else {
                _userPendingYield[account] = pendingYield;
            }
        } else {
            uint256 withdrawFee = (uint256(-balanceDiff) * lockIndexDiff) / RAY;
            if (pendingYield >= lockedYield) {
                uint256 accruedSettledYield = pendingYield - lockedYield;
                if (accruedSettledYield > 0) {
                    _userSettledYield[account] += accruedSettledYield;
                }
                _userPendingYield[account] = lockedYield - withdrawFee;
                _userSettledYield[owner()] += withdrawFee;
            } else {
                //in this case, pendingYield must be 0, there is nothing we need to update
            }
        }
    }

    /**
     * @notice sell Ape Coin to underlying yield token by uniswap v3. Need to take care price move issue.
     * @param apeCoinAmount The amount of Ape Coin to sell
     * @param minimumDealPrice The minimal accept deal price
     **/
    function _sellApeCoinForUnderlyingYieldToken(
        uint256 apeCoinAmount,
        uint256 minimumDealPrice
    ) internal returns (uint256) {
        return
            _swapRouter.exactInputSingle(
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: _apeCoin,
                    tokenOut: _yieldUnderlying,
                    fee: 3000,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountIn: apeCoinAmount,
                    amountOutMinimum: apeCoinAmount.wadMul(minimumDealPrice),
                    sqrtPriceLimitX96: 0
                })
            );
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal override {
        require(sender != recipient, "same address for transfer");
        _updateYieldIndex(sender, -int256(amount));
        _updateYieldIndex(recipient, int256(amount));
        super._transfer(sender, recipient, amount);
    }
}
