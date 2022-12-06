// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IPool} from "../../interfaces/IPool.sol";
import {PToken} from "./PToken.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";
import {ApeCoinStaking} from "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {IPToken} from "../../interfaces/IPToken.sol";
import {IPTokenAPE} from "../../interfaces/IPTokenAPE.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {ReentrancyGuard} from "../../dependencies/openzeppelin/contracts/ReentrancyGuard.sol";

/**
 * @title sApe PToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract PTokenSApe is PToken, ReentrancyGuard, IPTokenAPE {
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

    function depositApeCoin(uint256 amount)
        external
        onlyPool
        nonReentrant
    {
        _apeCoinStaking.depositApeCoin(amount, address(this));
    }

    function claimApeCoin(address _treasury)
        external
        onlyPool
        nonReentrant
    {
        _apeCoinStaking.claimApeCoin(_treasury);
    }

    function withdrawApeCoin(
        uint256 amount
    ) external onlyPool nonReentrant {
        _apeCoinStaking.withdrawApeCoin(amount, address(this));
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
