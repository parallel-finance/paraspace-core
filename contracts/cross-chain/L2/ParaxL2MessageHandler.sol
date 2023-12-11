// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {MessageType, BridgeMessage} from "../BridgeDefine.sol";
import "./BridgeERC721Handler.sol";
import "./IParaxL2MessageHandler.sol";

contract ParaxL2MessageHandler is IParaxL2MessageHandler {
    BridgeERC21Handler internal immutable erc712Handler;
    address immutable bridgeImpl;
    address immutable paraX;

    constructor(BridgeERC21Handler handler) {
        erc712Handler = handler;
    }

    function bridgeReceive(BridgeMessage calldata message) external {
        require(msg.sender == bridgeImpl, "");
        if (message.msgType == MessageType.BridgeERC721) {
            BridgeERC721Message memory message = abi.decode(
                message.data,
                (BridgeERC721Message)
            );
            erc712Handler.bridgeAsset(message);
        } else {}
    }

    function updateTokenDelegation(
        ERC721DelegationMessage calldata delegationInfo
    ) external {
        require(msg.sender == paraX, Errors.ONLY_PARAX);

        BridgeMessage memory message;
        message.msgType = MessageType.ERC721DELEGATION;
        message.data = abi.encode(delegationInfo);
        //send msg
    }
}
