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
    mapping(address => uint256) private _userYieldIndex;
    mapping(address => uint256) private _userPendingYield;
    mapping(address => uint256) private _userSettledYield;

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
        uint256 index
    ) external override onlyPool {
        _updateUserIndex(from, -int256(amount));

        _burnScaled(from, receiverOfUnderlying, amount, index);
        if (receiverOfUnderlying != address(this)) {
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

    function claimFor(address account) external {
        uint256 settledYield = _updateUserIndex(account, 0);
        if (settledYield > 0) {
            (address yieldUnderlying, address yieldToken) = IYieldInfo(
                _underlyingAsset
            ).yieldToken();
            uint256 liquidityIndex = POOL.getReserveNormalizedIncome(
                yieldUnderlying
            );
            settledYield = settledYield.rayMul(liquidityIndex);
            if (settledYield > IERC20(yieldToken).balanceOf(address(this))) {
                IAutoYieldApe(_underlyingAsset).claimFor(address(this));
            }
            IERC20(yieldToken).safeTransfer(account, settledYield);
            _userSettledYield[account] = 0;
        }
    }

    function yieldAmount(address account) external view returns (uint256) {
        uint256 userBalance = balanceOf(account);
        uint256 pendingYield = _userPendingYield[account];
        if (userBalance > 0) {
            uint256 userIndex = _userYieldIndex[account];
            (uint256 settledYieldIndex, uint256 latestYieldIndex) = IYieldInfo(
                _underlyingAsset
            ).yieldIndex();
            uint256 indexDiff = latestYieldIndex - userIndex;
            if (indexDiff > 0) {
                uint256 accruedYield = (userBalance * indexDiff) / RAY;
                pendingYield += accruedYield;
            }
            indexDiff = latestYieldIndex - settledYieldIndex;
            if (indexDiff > 0) {
                uint256 lockedYield = (userBalance * indexDiff) / RAY;
                if (pendingYield > lockedYield) {
                    pendingYield -= lockedYield;
                } else {
                    pendingYield = 0;
                }
            }
        }

        uint256 totalYield = _userSettledYield[account] + pendingYield;
        if (totalYield > 0) {
            (address yieldUnderlying, ) = IYieldInfo(_underlyingAsset)
                .yieldToken();
            uint256 liquidityIndex = POOL.getReserveNormalizedIncome(
                yieldUnderlying
            );
            totalYield = totalYield.rayMul(liquidityIndex);
        }

        return totalYield;
    }

    function _updateUserIndex(address account, int256 balanceDiff)
        internal
        returns (uint256)
    {
        uint256 userBalance = balanceOf(account);
        (uint256 settledYieldIndex, uint256 latestYieldIndex) = IYieldInfo(
            _underlyingAsset
        ).yieldIndex();
        uint256 indexDiff = latestYieldIndex - _userYieldIndex[account];
        uint256 pendingYield = _userPendingYield[account];
        if (indexDiff > 0) {
            if (userBalance > 0) {
                uint256 accruedYield = (userBalance * indexDiff) / RAY;
                pendingYield += accruedYield;
            }
            _userYieldIndex[account] = latestYieldIndex;
        }

        uint256 lockIndexDiff = latestYieldIndex - settledYieldIndex;
        uint256 pendingYieldLimit = (userBalance * lockIndexDiff) / RAY;

        uint256 settledYield = _userSettledYield[account];
        if (balanceDiff >= 0) {
            if (pendingYield > pendingYieldLimit) {
                settledYield += (pendingYield - pendingYieldLimit);
                _userSettledYield[account] = settledYield;
                _userPendingYield[account] = pendingYieldLimit;
            } else {
                _userPendingYield[account] = pendingYield;
            }
        } else {
            uint256 withdrawFee = (uint256(-balanceDiff) * lockIndexDiff) / RAY;
            if (pendingYield >= pendingYieldLimit) {
                settledYield += (pendingYield - pendingYieldLimit);
                _userSettledYield[account] = settledYield;
                _userPendingYield[account] = pendingYieldLimit - withdrawFee;
            } else {
                //in this case, pendingYield must be 0, there is nothing we need to update
            }
        }

        return settledYield;
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
