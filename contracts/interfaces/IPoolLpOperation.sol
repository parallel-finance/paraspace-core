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
    /**
     * @notice Increases liquidity for underlying NFT LP
     * @param tokenId The id of the erc721 token
     * @param amountAdd0 The amount to add of token0
     * @param amountAdd1 The amount to add of token1
     * @param amount0Min The minimum amount to add of token0
     * @param amount1Min The minimum amount to add of token1
     * @param deadline The time by which the transaction must be included
     */
    function increaseLiquidity(
        address asset,
        uint256 tokenId,
        uint256 amountAdd0,
        uint256 amountAdd1,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 deadline
    ) external payable;

    /**
     * @notice Adjust liquidity position for underlying NFT LP
     * @param assetInfo The underlying erc20 asset info for adjusting position
     * @param decreaseLiquidityParam The params for decreasing underlying NFT LP liquidity
     * @param mintParams The params for minting new underlying NFT LP
     */
    function adjustLpPosition(
        DataTypes.AssetInfo calldata assetInfo,
        DataTypes.DecreaseLiquidityParam calldata decreaseLiquidityParam,
        DataTypes.MintParams calldata mintParams
    ) external;
}
