// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IPool} from "../../interfaces/IPool.sol";
import {RebasingPToken} from "./RebasingPToken.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";

interface AToken {
    function POOL() external view returns (IPool pool);

    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
}

/**
 * @title stETH Rebasing PToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract PTokenAToken is RebasingPToken {
    constructor(IPool pool) RebasingPToken(pool) {
        //intentionally empty
    }

    /**
     * @return Current rebasing index of stETH in RAY
     **/
    function lastRebasingIndex() internal view override returns (uint256) {
        // Returns amount of stETH corresponding to 10**27 stETH shares.
        // The 10**27 is picked to provide the same precision as the AAVE
        // liquidity index, which is in RAY (10**27).
        return
            AToken(_underlyingAsset).POOL().getReserveNormalizedIncome(
                AToken(_underlyingAsset).UNDERLYING_ASSET_ADDRESS()
            );
    }
}
