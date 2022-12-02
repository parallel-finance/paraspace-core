// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {NToken} from "./NToken.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";

/**
 * @title NTokenBAKC
 *
 * @notice Implementation of the NTokenBAKC for the ParaSpace protocol
 */
abstract contract NTokenBAKC is NToken {
    using SafeERC20 for IERC20;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool) NToken(pool, false) {}

    function setApprove(
        address ape,
        address nTokenBAYC,
        address nTokenMAYC
    ) external onlyPoolAdmin {
        IERC20(ape).safeApprove(nTokenBAYC, type(uint256).max);
        IERC20(ape).safeApprove(nTokenMAYC, type(uint256).max);
        IERC721(_underlyingAsset).setApprovalForAll(address(POOL), true);
    }

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenBAKC;
    }
}
