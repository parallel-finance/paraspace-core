// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

/**
 * @title IPool
 *
 * @notice Defines the basic interface for an ParaSpace Pool.
 **/
interface IPoolCrossChain {
    function updateTokenDelegation(
        address delegateTo,
        address underlyingAsset,
        uint256[] calldata tokenIds,
        bool value
    ) external;

    function CROSS_CHAIN_MSG_HANDLER() external view returns (address);
}
