// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IPool} from "../../interfaces/IPool.sol";
import {PToken} from "./PToken.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";
import {ApeCoinStaking} from "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {IPToken} from "../../interfaces/IPToken.sol";
import {IPTokenAPE} from "../../interfaces/IPTokenAPE.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";

/**
 * @title sApe PToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract PTokenSApe is PToken, IPTokenAPE {
    ApeCoinStaking immutable _apeCoinStaking;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool, address apeCoinStaking) PToken(pool) {
        _apeCoinStaking = ApeCoinStaking(apeCoinStaking);
    }

    /**
     * @notice Returns the address of ApeCoinStaking contract address.
     **/
    function getApeStaking() external view returns (ApeCoinStaking) {
        return _apeCoinStaking;
    }

    function getXTokenType()
        external
        pure
        virtual
        override
        returns (XTokenType)
    {
        return XTokenType.PTokenApe;
    }
}
