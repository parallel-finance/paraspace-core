// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {NToken} from "./NToken.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {UserConfiguration} from "../libraries/configuration/UserConfiguration.sol";
import "../../interfaces/IParaApeStaking.sol";
import "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import "../libraries/helpers/Errors.sol";

/**
 * @title ApeCoinStaking NToken
 *
 * @notice Implementation of the NToken for the ParaSpace protocol
 */
abstract contract NTokenApeStaking is NToken {
    using SafeCast for uint256;
    using UserConfiguration for DataTypes.UserConfigurationMap;

    /**
     * @dev Minimum health factor to consider a user position healthy
     * A value of 1e18 results in 1
     */
    uint256 public constant HEALTH_FACTOR_LIQUIDATION_THRESHOLD = 1e18;

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

    function unstakeApeStakingPosition(address user, uint32[] calldata tokenIds)
        external
        nonReentrant
    {
        uint256 arrayLength = tokenIds.length;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];
            require(user == ownerOf(tokenId), Errors.NOT_THE_OWNER);
        }

        DataTypes.UserConfigurationMap memory userConfig = POOL
            .getUserConfiguration(user);
        uint16 sApeReserveId = paraApeStaking.sApeReserveId();
        bool usageAsCollateralEnabled = userConfig.isUsingAsCollateral(
            sApeReserveId
        );
        if (usageAsCollateralEnabled && userConfig.isBorrowingAny()) {
            (, , , , , uint256 healthFactor, ) = POOL.getUserAccountData(user);
            //need to check user health factor
            require(
                healthFactor < HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
                Errors.HEALTH_FACTOR_NOT_BELOW_THRESHOLD
            );
        }

        paraApeStaking.nApeOwnerChangeCallback(isBayc(), tokenIds);
    }
}
