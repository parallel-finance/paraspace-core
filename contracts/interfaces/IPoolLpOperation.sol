// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {IPoolAddressesProvider} from "./IPoolAddressesProvider.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

/**
 * @title IPool
 *
 * @notice Defines the basic interface for an ParaSpace Pool.
 **/
interface IPoolLpOperation {
    function adjustLpPosition(
        DataTypes.AssetInfo calldata assetInfo,
        DataTypes.DecreaseLiquidityParam calldata decreaseLiquidityParam,
        DataTypes.MintParams calldata mintParams
    ) external;
}
