// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IStakefishNFTManager} from "../../interfaces/IStakefishNFTManager.sol";
import {IStakefishValidator} from "../../interfaces/IStakefishValidator.sol";
import {INTokenStakefish} from "../../interfaces/INTokenStakefish.sol";
import {NToken} from "./NToken.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {Helpers} from "../libraries/helpers/Helpers.sol";

/**
 * @title  NTokenStakefish
 *
 * @notice Implementation of the NFT derivative token for the ParaSpace protocol
 */
contract NTokenStakefish is NToken, INTokenStakefish {
    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool) NToken(pool, true) {}

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenStakefish;
    }

    // @inheritdoc INTokenStakefish
    function withdraw(
        address user,
        uint256[] calldata tokenIds,
        address to
    ) external onlyPool nonReentrant {
        uint256 beforeBalance = address(this).balance;
        for (uint256 index = 0; index < tokenIds.length; index++) {
            require(
                user == _ERC721Data.owners[tokenIds[index]],
                Errors.NOT_THE_OWNER
            );
            address validatorAddr = _getValidatorAddr(tokenIds[index]);
            IStakefishValidator(validatorAddr).withdraw();
        }
        uint256 diff = address(this).balance - beforeBalance;
        if (diff > 0) Helpers.safeTransferETH(to, diff);
    }

    // @inheritdoc INTokenStakefish
    function claimFeePool(
        uint256[] calldata tokenIds,
        uint256[] calldata amountsRequested,
        address to
    ) external nonReentrant {
        require(
            tokenIds.length == amountsRequested.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        uint256 beforeBalance = address(this).balance;
        for (uint256 index = 0; index < tokenIds.length; index++) {
            require(
                msg.sender == _ERC721Data.owners[tokenIds[index]],
                Errors.NOT_THE_OWNER
            );
            address validatorAddr = _getValidatorAddr(tokenIds[index]);
            IStakefishValidator(validatorAddr).claimFeePool(
                amountsRequested[index]
            );
        }
        uint256 diff = address(this).balance - beforeBalance;
        if (diff > 0) Helpers.safeTransferETH(to, diff);
    }

    // @inheritdoc INTokenStakefish
    function requestExit(uint256[] calldata tokenIds) external nonReentrant {
        for (uint256 index = 0; index < tokenIds.length; index++) {
            require(
                msg.sender == _ERC721Data.owners[tokenIds[index]],
                Errors.NOT_THE_OWNER
            );
            address validatorAddr = _getValidatorAddr(tokenIds[index]);
            IStakefishValidator(validatorAddr).requestExit();
        }
    }

    // @inheritdoc INTokenStakefish
    function pendingFeePoolReward(uint256 tokenId)
        external
        view
        returns (uint256, uint256)
    {
        address validatorAddr = _getValidatorAddr(tokenId);
        return IStakefishValidator(validatorAddr).pendingFeePoolReward();
    }

    // Internal function to get the validator contract address for the given tokenId
    function _getValidatorAddr(uint256 tokenId)
        internal
        view
        returns (address)
    {
        // Get the validator address from the underlying Stakefish NFTManager contract
        address validatorAddr = IStakefishNFTManager(
            _ERC721Data.underlyingAsset
        ).validatorForTokenId(tokenId);
        // Ensure that the validator address is not zero
        require(validatorAddr != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        return validatorAddr;
    }

    function setTraitsMultipliers(uint256[] calldata, uint256[] calldata)
        external
        override
        onlyPoolAdmin
        nonReentrant
    {
        revert();
    }

    receive() external payable {}
}
