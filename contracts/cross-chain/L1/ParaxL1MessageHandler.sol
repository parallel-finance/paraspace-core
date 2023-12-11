// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import {MessageType, BridgeMessage, BridgeERC721Message} from "../BridgeDefine.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import "./IParaxBridgeNFTVault.sol";

contract ParaxL1MessageHandler {
    IParaxBridgeNFTVault internal immutable nftVault;
    address immutable bridgeImpl;

    constructor(IParaxBridgeNFTVault vault, address bridge) {
        nftVault = vault;
        bridgeImpl = bridge;
    }

    modifier onlyVault() {
        require(msg.sender == address(nftVault), Errors.ONLY_VAULT);
        _;
    }

    modifier onlyBridge() {
        require(msg.sender == address(bridgeImpl), Errors.ONLY_BRIDGE);
        _;
    }

    function addBridgeAsset(address asset) external onlyVault {}

    function bridgeAsset(
        BridgeERC721Message calldata message
    ) external onlyVault {}

    function bridgeReceive(BridgeMessage calldata message) external onlyBridge {
        if (message.msgType == MessageType.BridgeERC721) {
            BridgeERC721Message memory message = abi.decode(
                message.data,
                (BridgeERC721Message)
            );
            nftVault.releaseNFT(message);
        } else if (message.msgType == MessageType.ERC721DELEGATION) {
            ERC721DelegationMessage memory message = abi.decode(
                message.data,
                (ERC721DelegationMessage)
            );
            nftVault.updateTokenDelegation(message);
        }
    }
}
