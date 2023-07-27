// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {NToken} from "./NToken.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";
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
        super.initialize(
            initializingPool,
            underlyingAsset,
            incentivesController,
            nTokenName,
            nTokenSymbol,
            params
        );

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
        uint32[] memory claimTokenIds = new uint32[](arrayLength);
        uint256 tokenIdCount = 0;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index].toUint32();
            address underlyingOwner = IERC721(underlying).ownerOf(tokenId);
            if (underlyingOwner == address(paraApeStaking)) {
                claimTokenIds[tokenIdCount] = tokenId;
                tokenIdCount++;
            }
        }

        if (tokenIdCount > 0) {
            assembly {
                mstore(claimTokenIds, tokenIdCount)
            }
            paraApeStaking.nBakcOwnerChangeCallback(claimTokenIds);
        }
        return _burn(from, receiverOfUnderlying, tokenIds, timeLockParams);
    }

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenBAKC;
    }
}
