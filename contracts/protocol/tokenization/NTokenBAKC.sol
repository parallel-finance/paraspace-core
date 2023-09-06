// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {NToken} from "./NToken.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";
import {ApeStakingLogic} from "./libraries/ApeStakingLogic.sol";
import {INTokenApeStaking} from "../../interfaces/INTokenApeStaking.sol";
import {ApeCoinStaking} from "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {INToken} from "../../interfaces/INToken.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import "../../interfaces/IParaApeStaking.sol";
import "../../dependencies/openzeppelin/contracts/SafeCast.sol";

/**
 * @title NTokenBAKC
 *
 * @notice Implementation of the NTokenBAKC for the ParaSpace protocol
 */
contract NTokenBAKC is NToken {
    using SafeCast for uint256;

    IParaApeStaking immutable paraApeStaking;
    ApeCoinStaking immutable _apeCoinStaking;
    address private immutable nBAYC;
    address private immutable nMAYC;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(
        IPool pool,
        address apeCoinStaking,
        address _nBAYC,
        address _nMAYC,
        address delegateRegistry
    ) NToken(pool, false, delegateRegistry) {
        paraApeStaking = IParaApeStaking(pool.paraApeStaking());
        _apeCoinStaking = ApeCoinStaking(apeCoinStaking);
        nBAYC = _nBAYC;
        nMAYC = _nMAYC;
    }

    function initialize(
        IPool initializingPool,
        address underlyingAsset,
        IRewardController incentivesController,
        string calldata nTokenName,
        string calldata nTokenSymbol,
        bytes calldata params
    ) public virtual override initializer {
        super.initialize(
            initializingPool,
            underlyingAsset,
            incentivesController,
            nTokenName,
            nTokenSymbol,
            params
        );

        //v1
        IERC20 ape = _apeCoinStaking.apeCoin();
        //approve for nBAYC
        uint256 allowance = ape.allowance(address(this), nBAYC);
        if (allowance == 0) {
            ape.approve(nBAYC, type(uint256).max);
        }
        //approve for Pool nMAYC
        allowance = ape.allowance(address(this), nMAYC);
        if (allowance == 0) {
            ape.approve(nMAYC, type(uint256).max);
        }
        IERC721(underlyingAsset).setApprovalForAll(address(POOL), true);

        //v2
        IERC721(underlyingAsset).setApprovalForAll(
            address(paraApeStaking),
            true
        );
    }

    function _transfer(
        address from,
        address to,
        uint256 tokenId,
        bool validate
    ) internal override {
        address underlyingOwner = IERC721(_ERC721Data.underlyingAsset).ownerOf(
            tokenId
        );
        if (underlyingOwner == address(paraApeStaking)) {
            uint32[] memory tokenIds = new uint32[](1);
            tokenIds[0] = tokenId.toUint32();
            paraApeStaking.nBakcOwnerChangeCallback(tokenIds);
        } else {
            _unStakePairedApePosition(tokenId);
        }
        super._transfer(from, to, tokenId, validate);
    }

    /**
     * @notice Overrides the burn from NToken to withdraw all staked and pending rewards before burning the NToken on liquidation/withdraw
     */
    function burn(
        address from,
        address receiverOfUnderlying,
        uint256[] calldata tokenIds,
        DataTypes.TimeLockParams calldata timeLockParams
    ) external virtual override onlyPool nonReentrant returns (uint64, uint64) {
        if (from != receiverOfUnderlying) {
            for (uint256 index = 0; index < tokenIds.length; index++) {
                _unStakePairedApePosition(tokenIds[index]);
            }
        }
        return _burn(from, receiverOfUnderlying, tokenIds, timeLockParams);
    }

    function _unStakePairedApePosition(uint256 tokenId) internal {
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
