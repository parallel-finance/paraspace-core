// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {NToken} from "./NToken.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";
import {ApeStakingLogic} from "./libraries/ApeStakingLogic.sol";
import {INTokenApeStaking} from "../../interfaces/INTokenApeStaking.sol";
import {ApeCoinStaking} from "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {INToken} from "../../interfaces/INToken.sol";

/**
 * @title NTokenBAKC
 *
 * @notice Implementation of the NTokenBAKC for the ParaSpace protocol
 */
abstract contract NTokenBAKC is NToken {
    using SafeERC20 for IERC20;

    ApeCoinStaking immutable _apeCoinStaking;
    address public immutable nBAYC;
    address public immutable nMAYC;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool, address apeCoinStaking, address _nBAYC, address _nMAYC) NToken(pool, false) {
        _apeCoinStaking = ApeCoinStaking(apeCoinStaking);
        nBAYC = _nBAYC;
        nMAYC = _nMAYC;
    }

    function setApprove(address ape) external onlyPoolAdmin {
        IERC20(ape).safeApprove(nBAYC, type(uint256).max);
        IERC20(ape).safeApprove(nMAYC, type(uint256).max);
        IERC721(_underlyingAsset).setApprovalForAll(address(POOL), true);
    }

    function _transfer(
        address from,
        address to,
        uint256 tokenId,
        bool validate
    ) internal override {
        //check if have ape pair position
        (uint256 bakcStakedAmount, ) = _apeCoinStaking.nftPosition(
            ApeStakingLogic.BAKC_POOL_ID,
            tokenId
        );
        if (bakcStakedAmount > 0) {
            bool positionExisted = _tryUnstakeMainTokenPosition(
                ApeStakingLogic.BAYC_POOL_ID,
                nBAYC,
                tokenId
            );
            if (!positionExisted) {
                _tryUnstakeMainTokenPosition(
                    ApeStakingLogic.MAYC_POOL_ID,
                    nMAYC,
                    tokenId
                );
            }
        }

        _transfer(from, to, tokenId, validate);
    }

    function _tryUnstakeMainTokenPosition(
        uint256 poolId,
        address nToken,
        uint256 tokenId
    ) internal returns (bool) {
        (uint256 mainTokenId, bool positionExisted) = _apeCoinStaking
            .bakcToMain(tokenId, poolId);
        if (positionExisted) {
            bool sameOwner = INToken(nToken).ownerOf(mainTokenId) ==
                ownerOf(tokenId);
            if (sameOwner) {
                INTokenApeStaking(nToken).unstakePositionAndRepay(
                    mainTokenId,
                    address(0)
                );
            }
        }
        return positionExisted;
    }

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenBAKC;
    }
}
