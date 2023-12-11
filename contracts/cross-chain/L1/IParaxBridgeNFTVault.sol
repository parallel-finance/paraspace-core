// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {BridgeERC721Message, ERC721DelegationMessage} from "../BridgeDefine.sol";

interface IParaxBridgeNFTVault {
    function releaseNFT(BridgeERC721Message calldata message) external;

    function updateTokenDelegation(
        ERC721DelegationMessage calldata delegationInfo
    ) external;
}
