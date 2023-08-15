// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {IPool} from "../../interfaces/IPool.sol";
import {ILido} from "../../interfaces/ILido.sol";
import {RebasingPToken} from "./RebasingPToken.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";

/**
 * @title stKSM/stDOT Rebasing PToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract PTokenStKSM is RebasingPToken {
    constructor(IPool pool) RebasingPToken(pool) {
        //intentionally empty
    }

    /**
     * @return Current rebasing index of stETH in RAY
     **/
    function lastRebasingIndex() internal view override returns (uint256) {
        // Returns amount of stETH corresponding to 10**27 stETH shares.
        // The 10**27 is picked to provide the same precision as the ParaSpace
        // liquidity index, which is in RAY (10**27).
        return ILido(_underlyingAsset).getPooledKSMByShares(WadRayMath.RAY);
    }

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.PTokenStKSM;
    }
}
