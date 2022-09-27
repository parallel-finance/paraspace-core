// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

import {DataTypes} from "../../protocol/libraries/types/DataTypes.sol";

interface IWPunkGateway {
    function supplyPunk(
        DataTypes.ERC721SupplyParams[] calldata punkIndexes,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    function withdrawPunk(uint256[] calldata punkIndexes, address to) external;

    function withdrawPunkWithPermit(
        uint256[] calldata punkIndexes,
        address to,
        uint256 deadline,
        uint8 permitV,
        bytes32 permitR,
        bytes32 permitS
    ) external;

    function acceptBidWithCredit(
        bytes32 marketplaceId,
        bytes calldata payload,
        DataTypes.Credit calldata credit,
        uint256[] calldata punkIndexes,
        uint16 referralCode
    ) external;

    function batchAcceptBidWithCredit(
        bytes32[] calldata marketplaceIds,
        bytes[] calldata payloads,
        DataTypes.Credit[] calldata credits,
        uint256[] calldata punkIndexes,
        uint16 referralCode
    ) external;
}
