// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {MessageType, BridgeMessage, BridgeERC721Message} from "../BridgeDefine.sol";

interface IParaxL1MessageHandler {
    function addBridgeAsset(address asset) external;

    function bridgeAsset(BridgeERC721Message calldata message) external;
}
