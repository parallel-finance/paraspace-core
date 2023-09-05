// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

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
    constructor(
        IPool pool,
        address delegateRegistry
    ) NToken(pool, false, delegateRegistry) {
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

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenBAKC;
    }
}
