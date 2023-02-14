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
import "../interfaces/IAutoYieldApeReceiver.sol";
import "../interfaces/IPoolCore.sol";
import {WadRayMath} from "../protocol/libraries/math/WadRayMath.sol";

contract AutoYieldApe is
    Initializable,
    OwnableUpgradeable,
    ERC20Upgradeable,
    IAutoYieldApe,
    IYieldInfo
{
    using WadRayMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address;

    /// @notice ApeCoin single pool POOL_ID for ApeCoinStaking
    uint256 public constant APE_COIN_POOL_ID = 0;
    // Equals to `bytes4(keccak256("onAutoYieldApeReceived(address,address)"))`
    bytes4 private constant _AUTO_YIELD_APE_RECEIVED = 0xc7540caa;
    uint256 internal constant RAY = 1e27;

    ApeCoinStaking public immutable _apeStaking;
    address private immutable _apeCoin;
    address private immutable _yieldUnderlying;
    address private immutable _yieldToken;
    IPoolCore private immutable _lendingPool;
    ISwapRouter private immutable _swapRouter;

    uint256 private _currentYieldIndex;
    mapping(address => uint256) private _userYieldIndex;
    mapping(address => uint256) private _userPendingYield;
    address public harvestOperator;

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

    function deposit(address onBehalf, uint256 amount) external override {
        require(amount > 0, "zero amount");
        _updateYieldIndex(msg.sender);
        _mint(onBehalf, amount);

        IERC20(_apeCoin).safeTransferFrom(msg.sender, address(this), amount);
        _apeStaking.depositSelfApeCoin(amount);

        emit Deposit(msg.sender, onBehalf, amount);
    }

    function withdraw(uint256 amount) external override {
        _withdraw(amount);
    }

    function claim() external override {
        _updateYieldIndex(msg.sender);
        _claim();
    }

    function exit() external override {
        _withdraw(balanceOf(msg.sender));
        _claim();
    }

    function harvest(uint160 sqrtPriceLimitX96) external {
        require(msg.sender == harvestOperator, "non harvest operator");
        _harvest(sqrtPriceLimitX96);
    }

    function yieldAmount(address account) public view returns (uint256) {
        uint256 pendingYield = _userPendingYield[account];
        if (pendingYield > 0) {
            uint256 liquidityIndex = _lendingPool.getReserveNormalizedIncome(
                _yieldUnderlying
            );
            pendingYield = pendingYield.rayMul(liquidityIndex);
        }

        return pendingYield;
    }

    function yieldIndex() external view returns (uint256) {
        return _currentYieldIndex;
    }

    function yieldToken() external view returns (address) {
        return address(_yieldToken);
    }

    function yieldInfo()
        external
        view
        returns (
            address,
            address,
            uint256
        )
    {
        return (_yieldUnderlying, _yieldToken, _currentYieldIndex);
    }

    function setHarvestOperator(address _harvestOperator) external onlyOwner {
        require(_harvestOperator != address(0), "zero address");
        address oldOperator = harvestOperator;
        if (oldOperator != _harvestOperator) {
            harvestOperator = _harvestOperator;
            emit HarvestOperatorUpdated(oldOperator, _harvestOperator);
        }
    }

    function rescueERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(token != address(_yieldToken), "cannot rescue yield token");
        IERC20(token).safeTransfer(to, amount);
        emit RescueERC20(token, to, amount);
    }

    function _withdraw(uint256 amount) internal {
        require(amount > 0, "zero amount");

        _updateYieldIndex(msg.sender);
        _burn(msg.sender, amount);

        _apeStaking.withdrawSelfApeCoin(amount);
        IERC20(_apeCoin).safeTransfer(msg.sender, amount);

        emit Redeem(msg.sender, amount);
    }

    function _claim() internal {
        uint256 pendingYield = yieldAmount(msg.sender);
        if (pendingYield > 0) {
            _userPendingYield[msg.sender] = 0;
            IERC20(_yieldToken).safeTransfer(msg.sender, pendingYield);
        }
        emit YieldClaimed(msg.sender, pendingYield);
    }

    function _harvest(uint160 sqrtPriceLimitX96) internal {
        uint256 rewardAmount = _apeStaking.pendingRewards(
            APE_COIN_POOL_ID,
            address(this),
            0
        );
        if (rewardAmount > 0) {
            _apeStaking.claimSelfApeCoin();
            uint256 yieldUnderlyingAmount = _sellApeCoinForYieldToken(
                rewardAmount,
                sqrtPriceLimitX96
            );
            IPoolCore(_lendingPool).supply(
                _yieldUnderlying,
                yieldUnderlyingAmount,
                address(this),
                0
            );
            uint256 liquidityIndex = _lendingPool.getReserveNormalizedIncome(
                _yieldUnderlying
            );
            uint256 _yieldAmount = yieldUnderlyingAmount.rayDiv(liquidityIndex);
            uint256 accuIndex = (_yieldAmount * RAY) / totalSupply();
            _currentYieldIndex += accuIndex;
        }
    }

    function _updateYieldIndex(address account) internal {
        uint256 currentYieldIndex = _currentYieldIndex;
        uint256 indexDiff = currentYieldIndex - _userYieldIndex[account];
        if (indexDiff > 0) {
            uint256 rewardDiff = (balanceOf(account) * indexDiff) / RAY;
            if (rewardDiff > 0) {
                _userPendingYield[account] += rewardDiff;
            }
            _userYieldIndex[account] = currentYieldIndex;
        }
    }

    function _sellApeCoinForYieldToken(
        uint256 apeCoinAmount,
        uint160 sqrtPriceLimitX96
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
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: sqrtPriceLimitX96
                })
            );
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal override {
        _updateYieldIndex(sender);
        _updateYieldIndex(recipient);
        super._transfer(sender, recipient, amount);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256
    ) internal override {
        _checkOnAutoYieldApeReceived(from, to);
    }

    function _checkOnAutoYieldApeReceived(address from, address to)
        internal
        returns (bool)
    {
        if (!to.isContract()) {
            return true;
        }
        (bool success, bytes memory returndata) = to.call{gas: 5000}(
            abi.encodeWithSelector(
                IAutoYieldApeReceiver(to).onAutoYieldApeReceived.selector,
                _msgSender(),
                from
            )
        );
        bytes4 retval = abi.decode(returndata, (bytes4));
        require(
            success && retval == _AUTO_YIELD_APE_RECEIVED,
            "transfer to non yApe implementer2"
        );
        return true;
    }
}
