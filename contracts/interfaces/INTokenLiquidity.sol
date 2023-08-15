// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface INTokenLiquidity {
    /**
     * @notice Decreases liquidity for underlying NFT LP and validates
     * that the user respects liquidation checks.
     * @param user The user address decreasing liquidity for
     * @param tokenId The id of the erc721 token
     * @param liquidityDecrease The amount of liquidity to remove of LP
     * @param amount0Min The minimum amount to remove of token0
     * @param amount1Min The minimum amount to remove of token1
     * @param receiveEth If convert weth to ETH
     */
    function decreaseLiquidity(
        address user,
        uint256 tokenId,
        uint128 liquidityDecrease,
        uint256 amount0Min,
        uint256 amount1Min,
        bool receiveEth
    ) external;
}
