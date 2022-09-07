// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IPool} from "../../interfaces/IPool.sol";
import {RebasingPToken} from "./RebasingPToken.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";

interface ILido {
    function getPooledEthByShares(uint256 _sharesAmount)
        external
        view
        returns (uint256);
}

/**
 * @title stETH Rebasing PToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract PTokenStETH is RebasingPToken {
    constructor(IPool pool) RebasingPToken(pool) {
        //intentially empty
    }

    /**
     * @return Current rebasing index of stETH in RAY
     **/
    function lastRebasingIndex() internal view override returns (uint256) {
        // Returns amount of stETH corresponding to 10**27 stETH shares.
        // The 10**27 is picked to provide the same precision as the AAVE
        // liquidity index, which is in RAY (10**27).
        return ILido(_underlyingAsset).getPooledEthByShares(WadRayMath.RAY);
    }
}
