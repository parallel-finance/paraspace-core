// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import {MessageType, BridgeMessage, ERC721DelegationMessage} from "../BridgeDefine.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import "./IVaultParaX.sol";

contract ParaxL1MessageHandler {
    address internal immutable vault;
    address public immutable socket;

    constructor(address vault_, address bridge) {
        vault = vault_;
        socket = bridge;
    }

    modifier onlyBridge() {
        require(msg.sender == socket, Errors.ONLY_BRIDGE);
        _;
    }

    function migration(address asset) external {}

    function bridgeReceive(BridgeMessage calldata message) external onlyBridge {
        if (message.msgType == MessageType.ERC721DELEGATION) {
            ERC721DelegationMessage memory delegationMsg = abi.decode(
                message.data,
                (ERC721DelegationMessage)
            );
            IVaultParaX(vault).updateTokenDelegation(
                delegationMsg.delegateTo,
                delegationMsg.asset,
                delegationMsg.tokenIds,
                delegationMsg.value
            );
        }
    }
}
