// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

enum MessageType {
    AddNewCrossChainERC721,
    BridgeERC721,
    ERC721DELEGATION
}

struct BridgeMessage {
    MessageType msgType;
    bytes data;
}

struct BridgeERC721Message {
    address asset;
    uint256[] tokenIds;
    address receiver;
}

struct ERC721DelegationMessage {
    address asset;
    address delegateTo;
    uint256[] tokenIds;
    bool value;
}

//library BridgeDefine {
//
//
//}
