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
import {DataTypes} from "../libraries/types/DataTypes.sol";

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
    constructor(IPool pool, address delegateRegistry)
        NToken(pool, false, delegateRegistry)
    {}

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenStakefish;
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
    function getNFTData(uint256 tokenId)
        external
        view
        returns (DataTypes.StakefishNTokenData memory data)
    {
        address validatorAddr = _getValidatorAddr(tokenId);
        data.validatorIndex = IStakefishValidator(validatorAddr)
            .validatorIndex();
        data.pubkey = IStakefishValidator(validatorAddr).pubkey();
        data.withdrawnBalance = IStakefishValidator(validatorAddr)
            .withdrawnBalance();
        data.feePoolAddress = IStakefishValidator(validatorAddr)
            .feePoolAddress();
        data.nftArtUrl = IStakefishValidator(validatorAddr).getNFTArtUrl();
        data.protocolFee = IStakefishValidator(validatorAddr).getProtocolFee();
        IStakefishValidator.StateChange
            memory lastStateChange = IStakefishValidator(validatorAddr)
                .lastStateChange();

        uint8 size = uint8(lastStateChange.state) + 1;
        IStakefishValidator.StateChange[]
            memory stateHistory = new IStakefishValidator.StateChange[](size);
        for (uint256 i = 0; i < size; i++) {
            stateHistory[i] = IStakefishValidator(validatorAddr).stateHistory(
                i
            );
        }
        data.stateHistory = stateHistory;

        if (data.feePoolAddress != address(0)) {
            (
                uint256 pendingRewards,
                uint256 collectedRewards
            ) = IStakefishValidator(validatorAddr).pendingFeePoolReward();
            data.pendingFeePoolReward[0] = pendingRewards;
            data.pendingFeePoolReward[1] = collectedRewards;
        }
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

    receive() external payable {}
}
