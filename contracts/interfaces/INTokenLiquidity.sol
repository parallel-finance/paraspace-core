// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface INTokenLiquidity {
    /**
     * @notice Get underlying ERC20 asset pair.
     */
    function underlyingAsset(
        uint256 tokenId
    ) external view returns (address token0, address token1);

    /**
     * @notice Decreases liquidity for underlying NFT LP and validates
     * that the user respects liquidation checks.
     * @param user The user address decreasing liquidity for
     * @param tokenId The id of the erc721 token
     * @param liquidityDecrease The amount of liquidity to remove of LP
     * @param amount0Min The minimum amount to remove of token0
     * @param amount1Min The minimum amount to remove of token1
     */
    function decreaseLiquidity(
        address user,
        uint256 tokenId,
        uint128 liquidityDecrease,
        uint256 amount0Min,
        uint256 amount1Min
    )
        external
        returns (
            address token0,
            address token1,
            uint256 amount0,
            uint256 amount1
        );

    /**
     * @notice Increases liquidity for underlying NFT LP.
     * @param payer The user address pay for the asset to increase liquidity
     * @param tokenId The id of the erc721 token
     * @param amountAdd0 The amount to add of token0
     * @param amountAdd1 The amount to add of token1
     * @param amount0Min The minimum amount to add of token0
     * @param amount1Min The minimum amount to add of token1
     */
    function increaseLiquidity(
        address payer,
        uint256 tokenId,
        uint256 amountAdd0,
        uint256 amountAdd1,
        uint256 amount0Min,
        uint256 amount1Min
    ) external payable;
}
