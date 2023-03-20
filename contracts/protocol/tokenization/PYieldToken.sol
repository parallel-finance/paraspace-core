// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IPool} from "../../interfaces/IPool.sol";
import {PToken} from "./PToken.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";
import {SafeCast} from "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {GPv2SafeERC20} from "../../dependencies/gnosis/contracts/GPv2SafeERC20.sol";
import {IYieldInfo} from "../../interfaces/IYieldInfo.sol";
import {IAutoYieldApe} from "../../interfaces/IAutoYieldApe.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {ITimeLock} from "../../interfaces/ITimeLock.sol";

/**
 * @title Rebasing PToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract PYieldToken is PToken {
    using WadRayMath for uint256;
    using SafeCast for uint256;
    using GPv2SafeERC20 for IERC20;

    uint256 internal constant RAY = 1e27;
    //Record of calculated yield index for each user account
    mapping(address => uint256) private _userYieldIndex;
    //Record of pending yield for each user account,
    mapping(address => uint256) private _userPendingYield;
    //Record of balance which was locked withdraw fee for each user account,
    mapping(address => uint256) private _userLockFeeAmount;

    constructor(IPool pool) PToken(pool) {
        //intentionally empty
    }

    function mint(
        address caller,
        address onBehalfOf,
        uint256 amount,
        uint256 index
    ) external override onlyPool returns (bool) {
        _updateUserIndex(onBehalfOf, int256(amount));

        return _mintScaled(caller, onBehalfOf, amount, index);
    }

    function burn(
        address from,
        address receiverOfUnderlying,
        uint256 amount,
        uint256 index,
        DataTypes.TimeLockParams calldata timeLockParams
    ) external override onlyPool {
        _updateUserIndex(from, -int256(amount));

        _burnScaled(from, receiverOfUnderlying, amount, index);
        if (receiverOfUnderlying != address(this)) {
            if (timeLockParams.releaseTime != 0) {
                ITimeLock timeLock = POOL.TIME_LOCK();
                uint256[] memory amounts = new uint256[](1);
                amounts[0] = amount;

                timeLock.createAgreement(
                    DataTypes.AssetType.ERC20,
                    timeLockParams.actionType,
                    _underlyingAsset,
                    amounts,
                    receiverOfUnderlying,
                    timeLockParams.releaseTime
                );
                receiverOfUnderlying = address(timeLock);
            }
            IERC20(_underlyingAsset).safeTransfer(receiverOfUnderlying, amount);
        }
    }

    function _transfer(
        address from,
        address to,
        uint256 amount,
        bool validate
    ) internal override {
        _updateUserIndex(from, -int256(amount));
        _updateUserIndex(to, int256(amount));

        super._transfer(from, to, amount, validate);
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
            (uint256 lastAccruedIndex, uint256 latestYieldIndex) = IYieldInfo(
                _underlyingAsset
            ).yieldIndex();
            uint256 indexDiff = latestYieldIndex - userIndex;
            uint256 lockAmount;
            if (indexDiff > 0) {
                lockAmount = userBalance;
                //calculate newly accrued yield
                uint256 accruedYield = (userBalance * indexDiff) / RAY;
                freeYield += accruedYield;
            } else {
                lockAmount = _userLockFeeAmount[account];
            }

            //calculate locked yield for withdraw fee
            lockedYield = (lockAmount * lastAccruedIndex) / RAY;
            freeYield -= lockedYield;
        }

        return (freeYield, lockedYield);
    }

    function claimFor(address account) external {
        _updateUserIndex(account, 0);
        (uint256 freeYield, uint256 lockedYield) = _yieldAmount(account);
        if (freeYield > 0) {
            _userPendingYield[account] = lockedYield;

            (address yieldUnderlying, address yieldToken) = IYieldInfo(
                _underlyingAsset
            ).yieldToken();
            uint256 liquidityIndex = POOL.getReserveNormalizedIncome(
                yieldUnderlying
            );
            freeYield = freeYield.rayMul(liquidityIndex);
            if (freeYield > IERC20(yieldToken).balanceOf(address(this))) {
                IAutoYieldApe(_underlyingAsset).claimFor(address(this));
            }
            IERC20(yieldToken).safeTransfer(account, freeYield);
        }
    }

    function yieldAmount(address account) external view returns (uint256) {
        (uint256 freeYield, ) = _yieldAmount(account);
        if (freeYield > 0) {
            (address yieldUnderlying, ) = IYieldInfo(_underlyingAsset)
                .yieldToken();
            uint256 liquidityIndex = POOL.getReserveNormalizedIncome(
                yieldUnderlying
            );
            freeYield = freeYield.rayMul(liquidityIndex);
        }
        return freeYield;
    }

    function _updateUserIndex(address account, int256 balanceDiff) internal {
        uint256 userBalance = balanceOf(account);
        (uint256 lastAccruedIndex, uint256 latestYieldIndex) = IYieldInfo(
            _underlyingAsset
        ).yieldIndex();
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
            uint256 leftBalance = userBalance - (uint256(-balanceDiff));
            uint256 userLockFeeBalance = _userLockFeeAmount[account];
            //here we only need to update lock fee amount and charge fee when reduce user lock fee amount
            if (leftBalance < userLockFeeBalance) {
                uint256 withdrawLockAmount = userLockFeeBalance - leftBalance;
                uint256 withdrawFee = (withdrawLockAmount * lastAccruedIndex) /
                    RAY;
                _userLockFeeAmount[account] -= withdrawLockAmount;
                _userPendingYield[account] -= withdrawFee;
            }
        }
    }

    function getXTokenType()
        external
        pure
        virtual
        override
        returns (XTokenType)
    {
        return XTokenType.PYieldToken;
    }
}
