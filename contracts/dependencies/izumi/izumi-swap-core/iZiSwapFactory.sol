// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.4;

import "./interfaces/IiZiSwapFactory.sol";
import "./iZiSwapPool.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

struct DeployPoolParams {
    address tokenX;
    address tokenY;
    uint24 fee;
    int24 currentPoint;
    int24 pointDelta;
    uint24 feeChargePercent;
}

contract iZiSwapFactory is Ownable, IiZiSwapFactory {

    /// @notice charge receiver of all pools in this factory
    address public override chargeReceiver;

    /// @notice tokenX/tokenY/fee => pool address
    mapping(address => mapping(address => mapping(uint24 => address))) public override pool;

    /// @notice mapping from fee amount to pointDelta
    mapping(uint24 => int24) public override fee2pointDelta;

    /// @notice mark contract address in constructor to avoid delegate call
    address public only_addr_;

    /// @notice address of module to support swapX2Y(DesireY)
    address public override swapX2YModule;

    /// @notice address of module to support swapY2X(DesireX)
    address public override swapY2XModule;

    /// @notice address of module to support liquidity
    address public override liquidityModule;

    /// @notice address of module for user to manage limit orders
    address public override limitOrderModule;

    /// @notice address of module to support flash loan
    address public override flashModule;

    /// @notice default fee rate from miner's fee gain * 100
    uint24 public override defaultFeeChargePercent;

    DeployPoolParams public override deployPoolParams;

    /// @notice Construct the factory
    /// @param _swapX2YModule swap module to support swapX2Y(DesireY)
    /// @param _swapY2XModule swap module to support swapY2X(DesireX)
    /// @param _liquidityModule liquidity module to support mint/burn/collect
    /// @param _limitOrderModule module for user to manage limit orders
    /// @param _flashModule module for user to flash
    /// @param _defaultFeeChargePercent default fee rate from miner's fee gain * 100
    constructor(
        address _chargeReceiver, 
        address _swapX2YModule, 
        address _swapY2XModule, 
        address _liquidityModule, 
        address _limitOrderModule, 
        address _flashModule,
        uint24 _defaultFeeChargePercent
    ) {
        only_addr_ = address(this);
        fee2pointDelta[100] = 1;
        fee2pointDelta[400] = 8;
        fee2pointDelta[2000] = 40;
        fee2pointDelta[10000] = 200;
        swapX2YModule = _swapX2YModule;
        swapY2XModule = _swapY2XModule;
        liquidityModule = _liquidityModule;
        chargeReceiver = _chargeReceiver;
        limitOrderModule = _limitOrderModule;
        flashModule = _flashModule;
        defaultFeeChargePercent = _defaultFeeChargePercent;
    }

    modifier noDelegateCall() {
        require(address(this) == only_addr_);
        _;
    }

    /// @inheritdoc IiZiSwapFactory
    function enableFeeAmount(uint24 fee, uint24 pointDelta) external override noDelegateCall onlyOwner {
        require(pointDelta > 0, "P0");
        require(fee2pointDelta[fee] == 0, "FD0");
        fee2pointDelta[fee] = int24(pointDelta);
    }

    /// @inheritdoc IiZiSwapFactory
    function newPool(
        address tokenX,
        address tokenY,
        uint24 fee,
        int24 currentPoint
    ) external override noDelegateCall returns (address addr) {
        require(tokenX != tokenY, "SmTK");
        if (tokenX > tokenY) {
            (tokenX, tokenY) = (tokenY, tokenX);
        }
        require(pool[tokenX][tokenY][fee] == address(0));
        int24 pointDelta = fee2pointDelta[fee];

        require(pointDelta > 0, 'pd');
        // now creating
        bytes32 salt = keccak256(abi.encode(tokenX, tokenY, fee));
        
        deployPoolParams = DeployPoolParams({
            tokenX: tokenX,
            tokenY: tokenY,
            fee: fee,
            currentPoint: currentPoint,
            pointDelta: pointDelta,
            feeChargePercent: defaultFeeChargePercent
        });
        addr = address(new iZiSwapPool{salt: salt}());
        delete deployPoolParams;

        pool[tokenX][tokenY][fee] = addr;
        pool[tokenY][tokenX][fee] = addr;
        emit NewPool(tokenX, tokenY, fee, uint24(pointDelta), addr);
    }

    /// @inheritdoc IiZiSwapFactory
    function modifyChargeReceiver(address _chargeReceiver) external override onlyOwner {
        chargeReceiver = _chargeReceiver;
    }

    /// @inheritdoc IiZiSwapFactory
    function modifyDefaultFeeChargePercent(uint24 _defaultFeeChargePercent) external override onlyOwner {
        defaultFeeChargePercent = _defaultFeeChargePercent;
    }
    
}