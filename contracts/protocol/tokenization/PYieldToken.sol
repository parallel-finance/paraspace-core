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
import {IAutoYieldApeReceiver} from "../../interfaces/IAutoYieldApeReceiver.sol";

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

    constructor(IPool pool) PToken(pool) {
        //intentionally empty
    }

    function mint(
        address caller,
        address onBehalfOf,
        uint256 amount,
        uint256 index
    ) external override onlyPool returns (bool) {
        uint256 principle = balanceOf(onBehalfOf);
        uint256 yieldIndex = IYieldInfo(_underlyingAsset).yieldIndex();
        _updateUserIndex(onBehalfOf, principle, yieldIndex);

        return _mintScaled(caller, onBehalfOf, amount, index);
    }

    function burn(
        address from,
        address receiverOfUnderlying,
        uint256 amount,
        uint256 index
    ) external override onlyPool {
        uint256 principle = balanceOf(from);
        uint256 yieldIndex = IYieldInfo(_underlyingAsset).yieldIndex();
        _updateUserIndex(from, principle, yieldIndex);

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
        uint256 principleFrom = balanceOf(from);
        uint256 principleTo = balanceOf(to);
        uint256 yieldIndex = IYieldInfo(_underlyingAsset).yieldIndex();
        _updateUserIndex(from, principleFrom, yieldIndex);
        _updateUserIndex(to, principleTo, yieldIndex);

        super._transfer(from, to, amount, validate);
    }

    function claimYield() external {
        IAutoYieldApe(_underlyingAsset).claim();
        uint256 principle = balanceOf(msg.sender);
        (
            address yieldUnderlying,
            address yieldToken,
            uint256 yieldIndex
        ) = IYieldInfo(_underlyingAsset).yieldInfo();
        _updateUserIndex(msg.sender, principle, yieldIndex);
        uint256 claimAmount = _yieldAmount(
            msg.sender,
            principle,
            yieldUnderlying,
            yieldIndex
        );
        IERC20(yieldToken).safeTransfer(msg.sender, claimAmount);
        _userPendingYield[msg.sender] = 0;
    }

    function yieldAmount(address account) external view returns (uint256) {
        uint256 principle = balanceOf(account);
        (address yieldUnderlying, , uint256 yieldIndex) = IYieldInfo(
            _underlyingAsset
        ).yieldInfo();
        return _yieldAmount(account, principle, yieldUnderlying, yieldIndex);
    }

    function _yieldAmount(
        address account,
        uint256 principle,
        address yieldUnderlying,
        uint256 yieldIndex
    ) internal view returns (uint256) {
        uint256 indexDiff = yieldIndex - _userYieldIndex[account];
        uint256 claimAmount = _userPendingYield[account] +
            (principle * indexDiff) /
            RAY;
        uint256 liquidityIndex = POOL.getReserveNormalizedIncome(
            yieldUnderlying
        );
        return claimAmount.rayMul(liquidityIndex);
    }

    function _updateUserIndex(
        address account,
        uint256 userBalance,
        uint256 yieldIndex
    ) internal {
        uint256 indexDiff = yieldIndex - _userYieldIndex[account];
        if (indexDiff > 0) {
            if (userBalance > 0) {
                uint256 yieldAdd = (userBalance * indexDiff) / RAY;
                _userPendingYield[account] += yieldAdd;
            }
            _userYieldIndex[account] = yieldIndex;
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

    function onAutoYieldApeReceived(address, address)
        external
        pure
        returns (bytes4)
    {
        //this.onAutoYieldApeReceived.selector
        return 0xc7540caa;
    }
}
