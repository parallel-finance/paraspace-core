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

/**
 * @title NTokenBAKC
 *
 * @notice Implementation of the NTokenBAKC for the ParaSpace protocol
 */
abstract contract NTokenBAKC is NToken {
    using SafeERC20 for IERC20;

    ApeCoinStaking immutable _apeCoinStaking;
    INTokenApeStaking public nBAYC;
    INTokenApeStaking public nMAYC;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool, address apeCoinStaking) NToken(pool, false) {
        _apeCoinStaking = ApeCoinStaking(apeCoinStaking);
    }

    function setNToken(address _nBAYC, address _nMAYC) external onlyPoolAdmin {
        nBAYC = INTokenApeStaking(_nBAYC);
        nMAYC = INTokenApeStaking(_nMAYC);
    }

    function setApprove(address ape) external onlyPoolAdmin {
        IERC20(ape).safeApprove(address(nBAYC), type(uint256).max);
        IERC20(ape).safeApprove(address(nMAYC), type(uint256).max);
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
            (uint256 baycTokenId, bool pairedWithBayc) = _apeCoinStaking
                .bakcToMain(tokenId, ApeStakingLogic.BAYC_POOL_ID);
            if (pairedWithBayc) {
                nBAYC.unstakePositionAndRepay(baycTokenId, address(0));
            } else {
                (uint256 maycTokenId, bool pairedWithMayc) = _apeCoinStaking
                    .bakcToMain(tokenId, ApeStakingLogic.MAYC_POOL_ID);
                if (pairedWithMayc) {
                    nMAYC.unstakePositionAndRepay(maycTokenId, address(0));
                }
            }
        }

        _transfer(from, to, tokenId, validate);
    }

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenBAKC;
    }
}
