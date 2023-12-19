// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {MessageType, BridgeMessage, BridgeERC721Message} from "../BridgeDefine.sol";
import {ERC721} from "../../dependencies/openzeppelin/contracts/ERC721.sol";
import "./IParaxL2MessageHandler.sol";
import "./IBridgeERC721.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";

contract BridgeERC21Handler {
    IParaxL2MessageHandler internal immutable l2MsgHandler;

    //origin asset -> bridge asset
    mapping(address => address) getBridgeAsset;
    mapping(address => address) getOriginAsset;

    constructor(IParaxL2MessageHandler msgHandler) {
        l2MsgHandler = msgHandler;
    }

    modifier onlyMsgHandler() {
        require(msg.sender == address(l2MsgHandler), Errors.ONLY_HANDLER);
        _;
    }

    function bridgeAsset(
        BridgeERC721Message calldata message
    ) external onlyMsgHandler {
        address asset = getBridgeAsset[message.asset];
        require(asset != address(0), "invalid");

        IBridgeERC721(asset).mint(message.receiver, message.tokenIds);
    }
}
