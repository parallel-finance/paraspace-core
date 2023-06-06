// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {IPool} from "../../interfaces/IPool.sol";
import {RebasingPToken} from "./RebasingPToken.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {IAToken} from "../../interfaces/IAToken.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";
import {ILido} from "../../interfaces/ILido.sol";

/**
 * @title aToken Rebasing PToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract PTokenAStETH is RebasingPToken {
    using WadRayMath for uint256;

    constructor(IPool pool) RebasingPToken(pool) {
        //intentionally empty
    }

    /**
     * @return Current rebasing index of aToken in RAY
     **/
    function lastRebasingIndex() internal view override returns (uint256) {
        // Returns Aave aToken liquidity index
        address underlyingAsset = IAToken(_underlyingAsset)
            .UNDERLYING_ASSET_ADDRESS();
        return
            IAToken(_underlyingAsset)
                .POOL()
                .getReserveNormalizedIncome(underlyingAsset)
                .rayMul(
                    ILido(underlyingAsset).getPooledEthByShares(WadRayMath.RAY)
                );
    }

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.PTokenAToken;
    }
}
