// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {BridgeERC721Message, ERC721DelegationMessage} from "../BridgeDefine.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import "../../dependencies/openzeppelin/upgradeability/Initializable.sol";
import "../../dependencies/openzeppelin/upgradeability/OwnableUpgradeable.sol";
import "./IParaxL1MessageHandler.sol";
import {IDelegateRegistry} from "../../dependencies/delegation/IDelegateRegistry.sol";

contract ParaxBridgeNFTVault is Initializable, OwnableUpgradeable {
    IParaxL1MessageHandler internal immutable l1MsgHander;

    IDelegateRegistry delegationRegistry;

    mapping(address => bool) supportAsset;

    constructor(IParaxL1MessageHandler msgHandler) {
        l1MsgHander = msgHandler;
    }

    modifier onlyMsgHandler() {
        require(msg.sender == address(l1MsgHander), Errors.ONLY_MSG_HANDLER);
        _;
    }

    function addBridgeAsset(address asset) external {
        require(supportAsset[asset] == false, "asset already added");
        supportAsset[asset] = true;
        l1MsgHander.addBridgeAsset(asset);
    }

    function bridgeAsset(
        address asset,
        uint256[] calldata tokenIds,
        address receiver
    ) external {
        require(supportAsset[asset] == true, "asset already added");
        //lock asset
        uint256 length = tokenIds.length;
        for (uint256 index = 0; index < length; index++) {
            uint256 tokenId = tokenIds[index];
            IERC721(asset).safeTransferFrom(msg.sender, address(this), tokenId);
        }

        //send cross chain msg
        l1MsgHander.bridgeAsset(
            BridgeERC721Message({
                asset: asset,
                tokenIds: tokenIds,
                receiver: receiver
            })
        );
    }

    function releaseNFT(
        BridgeERC721Message calldata message
    ) external onlyMsgHandler {
        uint256 length = message.tokenIds.length;
        for (uint256 index = 0; index < length; index++) {
            uint256 tokenId = message.tokenIds[index];
            IERC721(message.asset).safeTransferFrom(
                address(this),
                message.receiver,
                tokenId
            );
        }
    }

    function updateTokenDelegation(
        ERC721DelegationMessage calldata delegationInfo
    ) external onlyMsgHandler {
        uint256 length = delegationInfo.tokenIds.length;
        for (uint256 index = 0; index < length; index++) {
            uint256 tokenId = delegationInfo.tokenIds[index];
            delegationRegistry.delegateERC721(
                delegationInfo.delegateTo,
                delegationInfo.asset,
                tokenId,
                "",
                delegationInfo.value
            );
        }
    }
}
