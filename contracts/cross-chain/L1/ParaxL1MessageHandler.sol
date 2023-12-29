// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import {MessageType, BridgeMessage, ERC721DelegationMessage} from "../BridgeDefine.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import "./IVault.sol";

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

    function updateTokenDelegation(
        address delegateTo,
        address underlyingAsset,
        uint256[] calldata tokenIds,
        bool value
    ) external onlyBridge {
        IVault(vault).updateTokenDelegation(
            delegateTo,
            underlyingAsset,
            tokenIds,
            value
        );
    }

    function updateApeStakingBeneficiary(
        address nft,
        uint32[] calldata tokenIds,
        address newBenificiary
    ) external onlyBridge {
        IVault(vault).updateBeneficiary(nft, tokenIds, newBenificiary);
    }
}
