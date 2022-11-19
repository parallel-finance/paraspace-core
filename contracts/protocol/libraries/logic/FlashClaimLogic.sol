// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IERC721} from "../../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IFlashClaimReceiver} from "../../../misc/interfaces/IFlashClaimReceiver.sol";
import {INToken} from "../../../interfaces/INToken.sol";
import {DataTypes} from "../types/DataTypes.sol";
import {Errors} from "../helpers/Errors.sol";
import {ValidationLogic} from "./ValidationLogic.sol";
import "../../../interfaces/INTokenApeStaking.sol";
import {XTokenType, IXTokenType} from "../../../interfaces/IXTokenType.sol";

library FlashClaimLogic {
    // See `IPool` for descriptions
    event FlashClaim(
        address indexed target,
        address indexed initiator,
        address indexed nftAsset,
        uint256 tokenId
    );

    function executeFlashClaim(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        DataTypes.ExecuteFlashClaimParams memory params
    ) external {
        DataTypes.ReserveData storage reserve = reservesData[params.nftAsset];
        ValidationLogic.validateFlashClaim(reserve, params);

        address xTokenAddress = reserve.xTokenAddress;
        bool needCheckApeStaking = false;
        uint256 beforeStakingAmount = 0;
        XTokenType tokenType = INToken(xTokenAddress).getXTokenType();
        if (
            tokenType == XTokenType.NTokenBAYC ||
            tokenType == XTokenType.NTokenMAYC
        ) {
            needCheckApeStaking = true;
        }

        if (needCheckApeStaking) {
            beforeStakingAmount = INTokenApeStaking(xTokenAddress)
                .getApeStakingAmount(params.nftTokenIds);
        }

        uint256 i;
        // step 1: moving underlying asset forward to receiver contract
        for (i = 0; i < params.nftTokenIds.length; i++) {
            INToken(reserve.xTokenAddress).transferUnderlyingTo(
                params.receiverAddress,
                params.nftTokenIds[i]
            );
        }

        // step 2: execute receiver contract, doing something like airdrop
        require(
            IFlashClaimReceiver(params.receiverAddress).executeOperation(
                params.nftAsset,
                params.nftTokenIds,
                params.params
            ),
            Errors.INVALID_FLASH_CLAIM_RECEIVER
        );

        // step 3: moving underlying asset backward from receiver contract
        for (i = 0; i < params.nftTokenIds.length; i++) {
            IERC721(params.nftAsset).safeTransferFrom(
                params.receiverAddress,
                reserve.xTokenAddress,
                params.nftTokenIds[i]
            );

            emit FlashClaim(
                params.receiverAddress,
                msg.sender,
                params.nftAsset,
                params.nftTokenIds[i]
            );
        }

        if (needCheckApeStaking) {
            uint256 afterStakingAmount = INTokenApeStaking(xTokenAddress)
                .getApeStakingAmount(params.nftTokenIds);
            require(
                beforeStakingAmount == afterStakingAmount,
                Errors.APE_STAKING_AMOUNT_CHANGE
            );
        }
    }
}
