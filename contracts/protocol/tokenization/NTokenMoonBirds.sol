// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC1155} from "../../dependencies/openzeppelin/contracts/IERC1155.sol";
import {IERC721Metadata} from "../../dependencies/openzeppelin/contracts/IERC721Metadata.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {GPv2SafeERC20} from "../../dependencies/gnosis/contracts/GPv2SafeERC20.sol";
import {SafeCast} from "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {IMoonBirdBase} from "../../dependencies/erc721-collections/IMoonBird.sol";
import {IMoonBird} from "../../dependencies/erc721-collections/IMoonBird.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {NToken} from "./NToken.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";
import {IncentivizedERC20} from "./base/IncentivizedERC20.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";
import {ITimeLock} from "../../interfaces/ITimeLock.sol";

/**
 * @title MoonBird NToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract NTokenMoonBirds is NToken, IMoonBirdBase {
    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(
        IPool pool,
        address delegateRegistry
    ) NToken(pool, false, delegateRegistry) {
        // Intentionally left blank
    }

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenMoonBirds;
    }

    function burn(
        address from,
        address receiverOfUnderlying,
        uint256[] calldata tokenIds,
        DataTypes.TimeLockParams calldata timeLockParams
    )
        external
        virtual
        override
        onlyPool
        nonReentrant
        returns (
            uint64 oldCollateralizedBalance,
            uint64 newCollateralizedBalance
        )
    {
        (oldCollateralizedBalance, newCollateralizedBalance) = _burnMultiple(
            from,
            tokenIds
        );

        if (receiverOfUnderlying != address(this)) {
            address underlyingAsset = _ERC721Data.underlyingAsset;
            if (timeLockParams.releaseTime != 0) {
                ITimeLock timeLock = POOL.TIME_LOCK();
                timeLock.createAgreement(
                    DataTypes.AssetType.ERC721,
                    timeLockParams.actionType,
                    underlyingAsset,
                    tokenIds,
                    receiverOfUnderlying,
                    timeLockParams.releaseTime
                );
                receiverOfUnderlying = address(timeLock);
            }

            for (uint256 index = 0; index < tokenIds.length; index++) {
                IMoonBird(underlyingAsset).safeTransferWhileNesting(
                    address(this),
                    receiverOfUnderlying,
                    tokenIds[index]
                );
            }
        }
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 id,
        bytes memory
    ) external virtual override returns (bytes4) {
        // if the operator is the pool, this means that the pool is transferring the token to this contract
        // which can happen during a normal supplyERC721 pool tx
        if (operator == address(POOL)) {
            return this.onERC721Received.selector;
        }

        if (msg.sender == _ERC721Data.underlyingAsset) {
            // supply the received token to the pool and set it as collateral
            DataTypes.ERC721SupplyParams[]
                memory tokenData = new DataTypes.ERC721SupplyParams[](1);

            tokenData[0] = DataTypes.ERC721SupplyParams({
                tokenId: id,
                useAsCollateral: true
            });

            POOL.supplyERC721FromNToken(
                _ERC721Data.underlyingAsset,
                tokenData,
                from
            );
        }

        return this.onERC721Received.selector;
    }

    /**
        @dev an additional function that is custom to MoonBirds reserve.
        This function allows NToken holders to toggle on/off the nesting the status for the underlying tokens
    */
    function toggleNesting(uint256[] calldata tokenIds) external {
        for (uint256 index = 0; index < tokenIds.length; index++) {
            require(
                _isApprovedOrOwner(_msgSender(), tokenIds[index]),
                "ERC721: transfer caller is not owner nor approved"
            );
        }

        IMoonBird(_ERC721Data.underlyingAsset).toggleNesting(tokenIds);
    }

    /**
        @dev an additional function that is custom to MoonBirds reserve.
        This function allows NToken holders to get nesting the state for the underlying tokens
    */
    function nestingPeriod(
        uint256 tokenId
    ) external view returns (bool nesting, uint256 current, uint256 total) {
        return IMoonBird(_ERC721Data.underlyingAsset).nestingPeriod(tokenId);
    }

    /**
        @dev an additional function that is custom to MoonBirds reserve.
        This function check if nesting is open for the underlying tokens
    */
    function nestingOpen() external view returns (bool) {
        return IMoonBird(_ERC721Data.underlyingAsset).nestingOpen();
    }

    function claimUnderlying(
        address timeLockV1,
        uint256[] calldata agreementIds
    ) external virtual override onlyPool {
        ITimeLock(timeLockV1).claimMoonBirds(agreementIds);
    }
}
