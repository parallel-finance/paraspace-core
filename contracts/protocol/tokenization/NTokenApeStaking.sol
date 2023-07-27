// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {NToken} from "./NToken.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import "../../interfaces/IParaApeStaking.sol";
import "../../dependencies/openzeppelin/contracts/SafeCast.sol";

/**
 * @title ApeCoinStaking NToken
 *
 * @notice Implementation of the NToken for the ParaSpace protocol
 */
abstract contract NTokenApeStaking is NToken {
    using SafeCast for uint256;

    IParaApeStaking immutable paraApeStaking;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool, address delegateRegistry)
        NToken(pool, false, delegateRegistry)
    {
        paraApeStaking = IParaApeStaking(pool.paraApeStaking());
    }

    function initialize(
        IPool initializingPool,
        address underlyingAsset,
        IRewardController incentivesController,
        string calldata nTokenName,
        string calldata nTokenSymbol,
        bytes calldata params
    ) public virtual override initializer {
        IERC721(underlyingAsset).setApprovalForAll(
            address(paraApeStaking),
            true
        );

        super.initialize(
            initializingPool,
            underlyingAsset,
            incentivesController,
            nTokenName,
            nTokenSymbol,
            params
        );
    }

    function isBayc() internal pure virtual returns (bool) {
        // should be overridden
        return true;
    }

    /**
     * @notice Overrides the _transfer from NToken to withdraw all staked and pending rewards before transfer the asset
     */
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
            paraApeStaking.nApeOwnerChangeCallback(isBayc(), tokenIds);
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
        address underlying = _ERC721Data.underlyingAsset;
        uint256 arrayLength = tokenIds.length;
        uint32[] memory unstakeTokenIds = new uint32[](arrayLength);
        uint256 unstakeTokenIdCount = 0;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index].toUint32();
            address underlyingOwner = IERC721(underlying).ownerOf(tokenId);
            if (underlyingOwner == address(paraApeStaking)) {
                unstakeTokenIds[unstakeTokenIdCount] = tokenId;
                unstakeTokenIdCount++;
            }
        }

        if (unstakeTokenIdCount > 0) {
            assembly {
                mstore(unstakeTokenIds, unstakeTokenIdCount)
            }
            paraApeStaking.nApeOwnerChangeCallback(isBayc(), unstakeTokenIds);
        }

        return _burn(from, receiverOfUnderlying, tokenIds, timeLockParams);
    }
}
