// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IPool} from "../../interfaces/IPool.sol";
import {ILido} from "../../interfaces/ILido.sol";
import {RebasingDebtToken} from "./RebasingDebtToken.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";

/**
 * @title stETH Rebasing Debt Token
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract StETHDebtToken is RebasingDebtToken {
    constructor(IPool pool) RebasingDebtToken(pool) {
        //intentionally empty
    }

    /**
     * @return Current rebasing index of stETH in RAY
     **/
    function lastRebasingIndex() internal view override returns (uint256) {
        // Returns amount of stETH corresponding to 10**27 stETH shares.
        // The 10**27 is picked to provide the same precision as the ParaSpace
        // liquidity index, which is in RAY (10**27).
        return ILido(_underlyingAsset).getPooledEthByShares(WadRayMath.RAY);
    }
}
