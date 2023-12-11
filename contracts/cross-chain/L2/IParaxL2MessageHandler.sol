// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {MessageType, BridgeMessage, BridgeERC721Message, ERC721DelegationMessage} from "../BridgeDefine.sol";

interface IParaxL2MessageHandler {
    //function bridgeAsset(BridgeERC721Message calldata message) external;

    function updateTokenDelegation(
        ERC721DelegationMessage calldata delegationInfo
    ) external;
}
