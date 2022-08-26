// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC1155} from "../../dependencies/openzeppelin/contracts/IERC1155.sol";
import {IERC721Metadata} from "../../dependencies/openzeppelin/contracts/IERC721Metadata.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {GPv2SafeERC20} from "../../dependencies/gnosis/contracts/GPv2SafeERC20.sol";
import {SafeCast} from "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {NToken} from "./NToken.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {INonfungiblePositionManager} from "../../dependencies/uniswap/INonfungiblePositionManager.sol";

/**
 * @title UniswapV3 NToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract NTokenUniswapV3 is NToken {
    bool internal constant ATOMIC_PRICING_VALUE = true;
    uint256 public constant HEALTH_FACTOR_LIQUIDATION_THRESHOLD = 1e18;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool) NToken(pool, ATOMIC_PRICING_VALUE) {
        // Intentionally left blank
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 id,
        bytes memory data
    ) external virtual override returns (bytes4) {
        // only accept UniswapV3 tokens
        require(msg.sender == _underlyingAsset, Errors.OPERATION_NOT_SUPPORTED);

        // if the operator is the pool, this means that the pool is transferring the token to this contract
        // which can happen during a normal supplyERC721 pool tx
        if (operator == address(POOL)) {
            revert(Errors.OPERATION_NOT_SUPPORTED);
        }

        (
            ,
            ,
            address tokenA,
            address tokenB,
            ,
            ,
            ,
            ,
            ,
            ,
            ,

        ) = INonfungiblePositionManager(_underlyingAsset).positions(id);

        //TODO should we check for 0 balance tokens?

        require(
            POOL.getReserveData(tokenA).xTokenAddress != address(0) &&
                POOL.getReserveData(tokenB).xTokenAddress != address(0),
            Errors.ASSET_NOT_LISTED
        );

        return this.onERC721Received.selector;
    }

    /**
     * @notice A function that decreases the current liquidity.
     * @param tokenId The id of the erc721 token
     * @param token0Address The address of the underylying tokens
     * @param token1Address The address of the underylying tokens
     * @param amount0Min The minimum amount to remove of token0
     * @param amount1Min The minimum amount to remove of token1
     * @return amount0 The amount received back in token0
     * @return amount1 The amount returned back in token1
     */
    function _decreaseLiquidity(
        uint256 tokenId,
        address token0Address,
        address token1Address,
        uint128 liquidityDecrease,
        uint256 amount0Min,
        uint256 amount1Min
    ) internal returns (uint256 amount0, uint256 amount1) {
        // amount0Min and amount1Min are price slippage checks
        // if the amount received after burning is not greater than these minimums, transaction will fail
        INonfungiblePositionManager.DecreaseLiquidityParams
            memory params = INonfungiblePositionManager
                .DecreaseLiquidityParams({
                    tokenId: tokenId,
                    liquidity: liquidityDecrease,
                    amount0Min: amount0Min,
                    amount1Min: amount1Min,
                    deadline: block.timestamp
                });

        (amount0, amount1) = INonfungiblePositionManager(_underlyingAsset)
            .decreaseLiquidity(params);

        // send liquidity back to caller
        IERC20(token0Address).transfer(_msgSender(), amount0);
        IERC20(token1Address).transfer(_msgSender(), amount1);
    }

    /**
     * @notice Increases liquidity in the current range
     * @dev Pool must be initialized already to add liquidity
     * @param tokenId The id of the erc721 token
     * @param token0Address The address of the underylying tokens
     * @param token1Address The address of the underylying tokens
     * @param amount0 The amount to add of token0
     * @param amount1 The amount to add of token1
     * @param amount0Min The minimum amount to add of token0
     * @param amount1Min The minimum amount to add of token1
     * @return liquidity The amount of liquidity added
     * @return amount0 The amount of token0 added as liquidity
     * @return amount1 The amount of token1 added as liquidity
     */
    function _increaseLiquidityCurrentRange(
        uint256 tokenId,
        address token0Address,
        address token1Address,
        uint256 amountAdd0,
        uint256 amountAdd1,
        uint256 amount0Min,
        uint256 amount1Min
    )
        internal
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        // move underlyings into this contract
        IERC20(token0Address).transferFrom(
            _msgSender(),
            address(this),
            amountAdd0
        );
        IERC20(token1Address).transferFrom(
            _msgSender(),
            address(this),
            amountAdd1
        );

        // move underlyings from this contract to Uniswap
        INonfungiblePositionManager.IncreaseLiquidityParams
            memory params = INonfungiblePositionManager
                .IncreaseLiquidityParams({
                    tokenId: tokenId,
                    amount0Desired: amountAdd0,
                    amount1Desired: amountAdd1,
                    amount0Min: amount0Min,
                    amount1Min: amount1Min,
                    deadline: block.timestamp
                });

        // return information about amount increased
        (liquidity, amount0, amount1) = INonfungiblePositionManager(
            _underlyingAsset
        ).increaseLiquidity(params);

        // refund unused tokens
        if (amount0 < amountAdd0) {
            uint256 refund0 = amountAdd0 - amount0;
            IERC20(token0Address).transfer(_msgSender(), refund0);
        }

        if (amount1 < amountAdd1) {
            uint256 refund1 = amountAdd1 - amount1;
            IERC20(token1Address).transfer(_msgSender(), refund1);
        }
    }

    /**
     * @notice Increases liquidity for underlying Uniswap V3 NFT LP
     * @dev Pool must be initialized already to add liquidity
     * @param tokenId The id of the erc721 token
     * @param token0Address The address of the underylying tokens
     * @param token1Address The address of the underylying tokens
     * @param amountAdd0 The amount to add of token0
     * @param amountAdd1 The amount to add of token1
     * @param amount0Min The minimum amount to add of token0
     * @param amount1Min The minimum amount to add of token1
     */
    function increaseUniswapV3Liquidity(
        uint256 tokenId,
        address token0Address,
        address token1Address,
        uint256 amountAdd0,
        uint256 amountAdd1,
        uint256 amount0Min,
        uint256 amount1Min
    ) external {
        // interact with Uniswap V3
        _increaseLiquidityCurrentRange(
            tokenId,
            token0Address,
            token1Address,
            amountAdd0,
            amountAdd1,
            amount0Min,
            amount1Min
        );
    }

    /**
     * @notice Decreases liquidity for underlying Uniswap V3 NFT LP and validates
     * that the user respects liquidation checks.
     * @dev Pool must be initialized already to add liquidity
     * @param tokenId The id of the erc721 token
     * @param token0Address The address of the underylying tokens
     * @param token1Address The address of the underylying tokens
     * @param liquidityDecrease The amount of liquidity to remove of LP
     * @param amount0Min The minimum amount to remove of token0
     * @param amount1Min The minimum amount to remove of token1
     */
    function decreaseUniswapV3Liquidity(
        uint256 tokenId,
        address token0Address,
        address token1Address,
        uint128 liquidityDecrease,
        uint256 amount0Min,
        uint256 amount1Min
    ) external {
        // only the token owner of the NToken can decrease the underlying
        require(_msgSender() == ownerOf(tokenId), Errors.NOT_THE_OWNER);

        // interact with Uniswap V3
        _decreaseLiquidity(
            tokenId,
            token0Address,
            token1Address,
            liquidityDecrease,
            amount0Min,
            amount1Min
        );

        // return data about the users healthFactor after decrease
        (
            ,
            ,
            ,
            ,
            ,
            // totalCollateralBase
            // totalDebtBase
            // availableBorrowsBase
            // currentLiquidationThreshold
            // ltv
            // healthFactor
            uint256 healthFactor, // erc721HealthFactor

        ) = POOL.getUserAccountData(_msgSender());

        // revert if decrease would result in a liquidation
        require(
            healthFactor > HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
            Errors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
        );
    }
}
