// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IPool} from "../../interfaces/IPool.sol";
import {PToken} from "./PToken.sol";
import {NTokenApeStaking} from "./NTokenApeStaking.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";
import {ApeCoinStaking} from "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {INToken} from "../../interfaces/INToken.sol";
import {IPToken} from "../../interfaces/IPToken.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IScaledBalanceToken} from "../../interfaces/IScaledBalanceToken.sol";

/**
 * @title sApe PToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract PTokenSApe is PToken {
    using WadRayMath for uint256;

    constructor(IPool pool) PToken(pool) {
        //intentionally empty
    }

    function burn(
        address from,
        address receiverOfUnderlying,
        uint256 amount,
        uint256 index
    ) external virtual override onlyPool {
        _burnScaled(from, receiverOfUnderlying, amount, index);
    }

    function balanceOf(address user) public view override returns (uint256) {
        return IncentivizedERC20.balanceOf(user);
    }

    function transferUnderlyingTo(address, uint256)
        external
        virtual
        override
        onlyPool
    {
        revert("not allowed");
    }

    function transferOnLiquidation(
        address,
        address,
        uint256
    ) external view override onlyPool {
        revert("not allowed");
    }

    function _transfer(
        address,
        address,
        uint128
    ) internal virtual override {
        revert("not allowed");
    }

    function getXTokenType()
        external
        pure
        virtual
        override
        returns (XTokenType)
    {
        return XTokenType.PTokenSApe;
    }
}
