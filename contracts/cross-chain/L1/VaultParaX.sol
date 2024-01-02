// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import "../../dependencies/openzeppelin/contracts/ReentrancyGuard.sol";
import "../../dependencies/openzeppelin/contracts//Pausable.sol";
import "./IParaxL1MessageHandler.sol";
import "./IVaultParaX.sol";
import {IDelegateRegistry} from "../../dependencies/delegation/IDelegateRegistry.sol";

contract VaultParaX is ReentrancyGuard, Pausable, IVaultParaX {
    IParaxL1MessageHandler internal immutable l1MsgHander;

    IDelegateRegistry internal immutable delegationRegistry;

    constructor(
        IParaxL1MessageHandler msgHandler,
        address _delegationRegistry
    ) {
        l1MsgHander = msgHandler;
        delegationRegistry = IDelegateRegistry(_delegationRegistry);
    }

    modifier onlyMsgHandler() {
        require(msg.sender == address(l1MsgHander), Errors.ONLY_MSG_HANDLER);
        _;
    }

    function updateTokenDelegation(
        address delegateTo,
        address asset,
        uint256[] calldata tokenIds,
        bool value
    ) external onlyMsgHandler {
        uint256 length = tokenIds.length;
        for (uint256 index = 0; index < length; index++) {
            uint256 tokenId = tokenIds[index];
            delegationRegistry.delegateERC721(
                delegateTo,
                asset,
                tokenId,
                "",
                value
            );
        }
    }
}
