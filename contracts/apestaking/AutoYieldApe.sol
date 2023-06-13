// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../dependencies/openzeppelin/upgradeability/Initializable.sol";
import "../dependencies/openzeppelin/upgradeability/ERC20Upgradeable.sol";
import "../dependencies/openzeppelin/upgradeability/PausableUpgradeable.sol";
import "../dependencies/openzeppelin/contracts/IERC20.sol";
import "../dependencies/openzeppelin/contracts/SafeERC20.sol";
import "../dependencies/openzeppelin/contracts/SafeCast.sol";
import "../dependencies/openzeppelin/contracts/Address.sol";
import "../dependencies/uniswapv3-periphery/interfaces/ISwapRouter.sol";
import "../dependencies/yoga-labs/ApeCoinStaking.sol";
import "../interfaces/IAutoYieldApe.sol";
import "../interfaces/IYieldInfo.sol";
import "../interfaces/IPoolCore.sol";
import "../protocol/libraries/math/WadRayMath.sol";
import "../protocol/libraries/math/PercentageMath.sol";
import "../interfaces/IACLManager.sol";
import "../protocol/libraries/helpers/Errors.sol";
import "../interfaces/IVoteDelegator.sol";
import "../interfaces/IDelegation.sol";

contract AutoYieldApe is
    Initializable,
    PausableUpgradeable,
    ERC20Upgradeable,
    IAutoYieldApe,
    IVoteDelegator,
    IYieldInfo
{
    using PercentageMath for uint256;
    using WadRayMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeCast for uint256;
    using SafeCast for int256;

    /// @notice ApeCoin single pool POOL_ID for ApeCoinStaking
    uint256 internal constant APE_COIN_POOL_ID = 0;
    uint256 internal constant RAY = 1e27;

    ApeCoinStaking private immutable _apeStaking;
    address private immutable _apeCoin;
    address private immutable _yieldUnderlying;
    address private immutable _yieldToken;
    IPoolCore private immutable _lendingPool;
    ISwapRouter private immutable _swapRouter;
    IACLManager private immutable _aclManager;

    //The last accrued yield index
    uint256 private _poolLastAccruedIndex;
    //Accumulator of the latest yield rate since the opening of the pool
    uint256 private _poolLatestYieldIndex;
    //Record of calculated yield index for each user account
    mapping(address => uint256) private _userYieldIndex;
    //Record of pending yield for each user account,
    mapping(address => uint256) private _userPendingYield;
    //Record of balance which was locked withdraw fee for each user account,
    mapping(address => uint256) private _userLockFeeAmount;
    /// @notice This account is the only role who can perform harvest action.
    address public harvestOperator;
    /// @notice The pool's fee rate for harvest operation. Expressed in bps, a value of 30 results in 0.3%
    uint256 public harvestFeeRate;

    constructor(
        address apeStaking,
        address apeCoin,
        address yieldUnderlying,
        address lendingPool,
        address swapRouter,
        address aclManager
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
            Errors.INVALID_YIELD_UNDERLYING_TOKEN
        );
        _swapRouter = ISwapRouter(swapRouter);
        _aclManager = IACLManager(aclManager);
    }

    function initialize() public initializer {
        __ERC20_init("ParaSpace Auto Yield APE", "yAPE");

        //approve ApeCoin for apeCoinStaking
        IERC20(_apeCoin).safeApprove(address(_apeStaking), type(uint256).max);

        //approve _yieldUnderlying for lending pool
        IERC20(_yieldUnderlying).safeApprove(
            address(_lendingPool),
            type(uint256).max
        );
        //approve ApeCoin for uniswap
        IERC20(_apeCoin).safeApprove(address(_swapRouter), type(uint256).max);
    }

    /// @inheritdoc IAutoYieldApe
    function deposit(address onBehalf, uint256 amount)
        external
        override
        whenNotPaused
    {
        require(amount > 0, Errors.INVALID_AMOUNT);
        _updateYieldIndex(onBehalf, amount.toInt256());
        _mint(onBehalf, amount);

        IERC20(_apeCoin).safeTransferFrom(msg.sender, address(this), amount);
        _apeStaking.depositSelfApeCoin(amount);

        emit Deposit(msg.sender, onBehalf, amount);
    }

    /// @inheritdoc IAutoYieldApe
    function withdraw(uint256 amount) external override whenNotPaused {
        _withdraw(amount);
    }

    /// @inheritdoc IAutoYieldApe
    function claimFor(address account) external override whenNotPaused {
        _updateYieldIndex(account, 0);
        _claimFor(account);
    }

    /// @inheritdoc IAutoYieldApe
    function exit() external override whenNotPaused {
        _withdraw(balanceOf(msg.sender));
        _claimFor(msg.sender);
    }

    /// @inheritdoc IAutoYieldApe
    function harvest(bytes memory swapPath, uint256 minimumDealPrice)
        external
        override
    {
        require(msg.sender == harvestOperator, Errors.CALLER_NOT_OPERATOR);
        _harvest(swapPath, minimumDealPrice);
    }

    /// @inheritdoc IAutoYieldApe
    function yieldAmount(address account)
        external
        view
        override
        returns (uint256)
    {
        (uint256 freeYield, ) = _yieldAmount(account);
        if (freeYield > 0) {
            uint256 liquidityIndex = _lendingPool.getReserveNormalizedIncome(
                _yieldUnderlying
            );
            freeYield = freeYield.rayMul(liquidityIndex);
        }
        return freeYield;
    }

    /// @inheritdoc IYieldInfo
    function yieldIndex() external view override returns (uint256, uint256) {
        return (_poolLastAccruedIndex, _poolLatestYieldIndex);
    }

    /// @inheritdoc IYieldInfo
    function yieldToken() external view override returns (address, address) {
        return (_yieldUnderlying, _yieldToken);
    }

    /**
     * @notice Set a new address for harvest role. Only pool admin can call this function
     * @param _harvestOperator The address of the harvest role
     **/
    function setHarvestOperator(address _harvestOperator)
        external
        onlyPoolAdmin
    {
        require(_harvestOperator != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        address oldOperator = harvestOperator;
        if (oldOperator != _harvestOperator) {
            harvestOperator = _harvestOperator;
            emit HarvestOperatorUpdated(oldOperator, _harvestOperator);
        }
    }

    /**
     * @notice Set a new harvest fee rate. Only pool admin can call this function
     * @param _harvestFeeRate The new fee rate for harvest. Expressed in bps, a value of 30 results in 0.3%
     **/
    function setHarvestFeeRate(uint256 _harvestFeeRate) external onlyPoolAdmin {
        require(
            _harvestFeeRate < PercentageMath.HALF_PERCENTAGE_FACTOR,
            Errors.INVALID_FEE_VALUE
        );
        uint256 oldValue = harvestFeeRate;
        if (oldValue != _harvestFeeRate) {
            harvestFeeRate = _harvestFeeRate;
            emit HarvestFeeRateUpdated(oldValue, _harvestFeeRate);
        }
    }

    /**
     * @notice Rescue erc20 from this contract address. Only pool admin can call this function
     * @param token The token address to be rescued, _yieldToken cannot be rescued.
     * @param to The account address to receive token
     * @param amount The amount to be rescued
     **/
    function rescueERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyPoolAdmin {
        require(token != address(_yieldToken), Errors.TOKEN_NOT_ALLOW_RESCUE);
        IERC20(token).safeTransfer(to, amount);
        emit RescueERC20(token, to, amount);
    }

    /**
     * @notice claim harvest fee. Only pool admin can call this function
     * @param receiver The address to receive the fee
     **/
    function claimHarvestFee(address receiver) external onlyPoolAdmin {
        uint256 freeYield = _userPendingYield[address(this)];
        if (freeYield > 0) {
            _userPendingYield[address(this)] = 0;
            uint256 liquidityIndex = _lendingPool.getReserveNormalizedIncome(
                _yieldUnderlying
            );
            uint256 scaledYield = freeYield.rayMul(liquidityIndex);
            IERC20(_yieldToken).safeTransfer(receiver, scaledYield);

            emit YieldClaimed(msg.sender, receiver, scaledYield);
        }
    }

    /**
     * @notice Set delegation for staking Ape coin voting power. Only pool admin can call this function
     * @param delegateContract The delegate registry contract address
     * @param spaceId The id of the space delegating for
     * @param delegate The address to be delegate to
     **/
    function setVotingDelegate(
        address delegateContract,
        bytes32 spaceId,
        address delegate
    ) external onlyPoolAdmin {
        IDelegation(delegateContract).setDelegate(spaceId, delegate);
    }

    /**
     * @notice Clear delegation for staking Ape coin voting power. Only pool admin can call this function
     * @param delegateContract The delegate registry contract address
     * @param spaceId The id of the space delegating for
     **/
    function clearVotingDelegate(address delegateContract, bytes32 spaceId)
        external
        onlyPoolAdmin
    {
        IDelegation(delegateContract).clearDelegate(spaceId);
    }

    /**
     * @notice Get delegation address for staking Ape coin voting power.
     * @param delegateContract The delegate registry contract address
     * @param spaceId The id of the space delegating for
     **/
    function getDelegate(address delegateContract, bytes32 spaceId)
        external
        view
        returns (address)
    {
        return IDelegation(delegateContract).delegation(address(this), spaceId);
    }

    /**
     * @notice Pauses the contract. Only pool admin or emergency admin can call this function
     **/
    function pause() external onlyEmergencyOrPoolAdmin {
        _pause();
    }

    /**
     * @notice Unpause the contract. Only pool admin or emergency admin can call this function
     **/
    function unpause() external onlyPoolAdmin {
        _unpause();
    }

    /**
     * @dev Only pool admin can call functions marked by this modifier.
     **/
    modifier onlyPoolAdmin() {
        _onlyPoolAdmin();
        _;
    }

    /**
     * @dev Only emergency or pool admin can call functions marked by this modifier.
     **/
    modifier onlyEmergencyOrPoolAdmin() {
        _onlyPoolOrEmergencyAdmin();
        _;
    }

    function _onlyPoolAdmin() internal view {
        require(
            _aclManager.isPoolAdmin(msg.sender),
            Errors.CALLER_NOT_POOL_ADMIN
        );
    }

    function _onlyPoolOrEmergencyAdmin() internal view {
        require(
            _aclManager.isPoolAdmin(msg.sender) ||
                _aclManager.isEmergencyAdmin(msg.sender),
            Errors.CALLER_NOT_POOL_OR_EMERGENCY_ADMIN
        );
    }

    /**
     * @notice implementation for withdraw function.
     * @param amount The amount of ape to be withdraw
     **/
    function _withdraw(uint256 amount) internal {
        require(amount > 0, Errors.INVALID_AMOUNT);

        _updateYieldIndex(msg.sender, -(amount.toInt256()));
        _burn(msg.sender, amount);

        _apeStaking.withdrawSelfApeCoin(amount);
        IERC20(_apeCoin).safeTransfer(msg.sender, amount);

        emit Redeem(msg.sender, amount);
    }

    function _yieldAmount(address account)
        internal
        view
        returns (uint256, uint256)
    {
        uint256 userBalance = balanceOf(account);
        //free_yield = pending_yield + accrued_yield - free_yield
        uint256 freeYield = _userPendingYield[account];
        uint256 lockedYield = 0;
        if (userBalance > 0) {
            uint256 userIndex = _userYieldIndex[account];
            uint256 poolLatestIndex = _poolLatestYieldIndex;
            uint256 indexDiff = poolLatestIndex - userIndex;
            uint256 lockAmount;
            if (indexDiff > 0) {
                //calculate newly accrued yield
                lockAmount = userBalance;
                uint256 accruedYield = (userBalance * indexDiff) / RAY;
                freeYield += accruedYield;
            } else {
                lockAmount = _userLockFeeAmount[account];
            }

            //calculate locked yield for withdraw fee
            lockedYield = (lockAmount * _poolLastAccruedIndex) / RAY;
            freeYield -= lockedYield;
        }

        return (freeYield, lockedYield);
    }

    /**
     * @notice implementation for claimFor function.
     **/
    function _claimFor(address account) internal {
        (uint256 freeYield, uint256 lockedYield) = _yieldAmount(account);
        if (freeYield > 0) {
            _userPendingYield[account] = lockedYield;

            uint256 liquidityIndex = _lendingPool.getReserveNormalizedIncome(
                _yieldUnderlying
            );
            uint256 scaledYield = freeYield.rayMul(liquidityIndex);
            IERC20(_yieldToken).safeTransfer(account, scaledYield);

            emit YieldClaimed(msg.sender, account, scaledYield);
        }
    }

    /**
     * @notice implementation for harvest function.
     **/
    function _harvest(bytes memory swapPath, uint256 minimumDealPrice)
        internal
    {
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
                swapPath,
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
            uint256 _accruedYieldAmount = yieldUnderlyingAmount.rayDiv(
                liquidityIndex
            );

            //6, calculate harvest fee and subtracting harvest fee from yield amount
            //harvest_fee = yield_amount * harvest_fee_rate
            //new_yield_amount = yield_amount - harvest_fee
            uint256 _harvestFeeRate = harvestFeeRate;
            if (_harvestFeeRate > 0) {
                uint256 fee = _accruedYieldAmount.percentMul(_harvestFeeRate);
                _userPendingYield[address(this)] += fee;
                _accruedYieldAmount -= fee;
            }

            //7, update pool yield index.
            //accrued_index = new_yield_amount / total_supply
            //new_pool_last_accrued_index = accruedIndex
            //new_pool_latest_yield_index = pool_latest_yield_index + accrued_index
            uint256 accruedIndex = (_accruedYieldAmount * RAY) / totalSupply();
            _poolLastAccruedIndex = accruedIndex;
            _poolLatestYieldIndex += accruedIndex;
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
        //update pending yield and user lock fee amount first if necessary
        if (indexDiff > 0) {
            if (userBalance > 0) {
                uint256 accruedYield = (userBalance * indexDiff) / RAY;
                pendingYield += accruedYield;
                if (userBalance != _userLockFeeAmount[account]) {
                    _userLockFeeAmount[account] = userBalance;
                }
                _userPendingYield[account] = pendingYield;
            }
            _userYieldIndex[account] = latestYieldIndex;
        }

        //if it's the withdraw or transfer balance out case
        if (balanceDiff < 0) {
            uint256 leftBalance = userBalance - ((-balanceDiff).toUint256());
            uint256 userLockFeeBalance = _userLockFeeAmount[account];
            //here we only need to update lock fee amount and charge fee when reduce user lock fee amount
            if (leftBalance < userLockFeeBalance) {
                uint256 withdrawLockAmount = userLockFeeBalance - leftBalance;
                uint256 withdrawFee = (withdrawLockAmount *
                    _poolLastAccruedIndex) / RAY;
                _userLockFeeAmount[account] -= withdrawLockAmount;
                _userPendingYield[account] -= withdrawFee;
                _userPendingYield[address(this)] += withdrawFee;
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
        bytes memory swapPath,
        uint256 minimumDealPrice
    ) internal returns (uint256) {
        return
            _swapRouter.exactInput(
                ISwapRouter.ExactInputParams({
                    path: swapPath,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountIn: apeCoinAmount,
                    amountOutMinimum: apeCoinAmount.wadMul(minimumDealPrice)
                })
            );
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal override {
        require(sender != recipient, Errors.SENDER_SAME_AS_RECEIVER);
        _updateYieldIndex(sender, -(amount.toInt256()));
        _updateYieldIndex(recipient, amount.toInt256());
        super._transfer(sender, recipient, amount);
    }
}
