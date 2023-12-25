// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {MessageType, BridgeMessage, ERC721DelegationMessage} from "../BridgeDefine.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import "./IParaxL2MessageHandler.sol";
import "../socket/ISocket.sol";

contract ParaxL2MessageHandler is IParaxL2MessageHandler {
    uint32 public immutable siblingChainSlug;
    address public immutable socket;
    address public immutable paraX;

    constructor(address bridge, address paraX_, uint32 siblingChainSlug_) {
        socket = bridge;
        paraX = paraX_;
        siblingChainSlug = siblingChainSlug_;
    }

    function updateTokenDelegation(
        address delegateTo,
        address underlyingAsset,
        uint256[] calldata tokenIds,
        bool value
    ) external {
        require(msg.sender == paraX, Errors.ONLY_PARAX);

        ERC721DelegationMessage memory delegationInfo;
        delegationInfo.asset = underlyingAsset;
        delegationInfo.delegateTo = delegateTo;
        delegationInfo.tokenIds = tokenIds;
        delegationInfo.value = value;
        BridgeMessage memory message;
        message.msgType = MessageType.ERC721DELEGATION;
        message.data = abi.encode(delegationInfo);
        //send msg
        ISocket(socket).outbound(
            siblingChainSlug,
            150000,
            "",
            "",
            abi.encode(message)
        );
    }
}
