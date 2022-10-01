// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC1155} from "../../dependencies/openzeppelin/contracts/IERC1155.sol";
import {IERC721Metadata} from "../../dependencies/openzeppelin/contracts/IERC721Metadata.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {SafeCast} from "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {NToken} from "./NToken.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {INonfungiblePositionManager} from "../../dependencies/uniswap/INonfungiblePositionManager.sol";
import {IWETH} from "../../misc/interfaces/IWETH.sol";

/**
 * @title UniswapV3 NToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract NTokenUniswapV3 is NToken {
    using SafeERC20 for IERC20;

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
        address,
        uint256 id,
        bytes memory
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
            address token0,
            address token1,
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
            POOL.getReserveData(token0).xTokenAddress != address(0) &&
                POOL.getReserveData(token1).xTokenAddress != address(0),
            Errors.ASSET_NOT_LISTED
        );

        return this.onERC721Received.selector;
    }

    /**
     * @notice A function that decreases the current liquidity.
     * @param tokenId The id of the erc721 token
     * @param amount0Min The minimum amount to remove of token0
     * @param amount1Min The minimum amount to remove of token1
     * @return amount0 The amount received back in token0
     * @return amount1 The amount returned back in token1
     */
    function _decreaseLiquidity(
        uint256 tokenId,
        uint128 liquidityDecrease,
        uint256 amount0Min,
        uint256 amount1Min,
        bool receiveEthAsWeth
    ) internal returns (uint256 amount0, uint256 amount1) {
        if (liquidityDecrease > 0) {
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

            INonfungiblePositionManager(_underlyingAsset).decreaseLiquidity(
                params
            );
        }

        (
            ,
            ,
            address token0,
            address token1,
            ,
            ,
            ,
            ,
            ,
            ,
            ,

        ) = INonfungiblePositionManager(_underlyingAsset).positions(tokenId);

        address weth = _addressesProvider.getWETH();
        receiveEthAsWeth = (receiveEthAsWeth &&
            (token0 == weth || token1 == weth));

        address sender = msg.sender;
        uint128 MAX_INT_128 = 0xffffffffffffffffffffffffffffffff;
        INonfungiblePositionManager.CollectParams
            memory collectParams = INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: receiveEthAsWeth ? address(this) : sender,
                amount0Max: MAX_INT_128,
                amount1Max: MAX_INT_128
            });

        (amount0, amount1) = INonfungiblePositionManager(_underlyingAsset)
            .collect(collectParams);

        require(amount0 >= amount0Min, "Insufficient amount0");
        require(amount1 >= amount1Min, "Insufficient amount1");

        if (receiveEthAsWeth) {
            uint256 balanceWeth = IERC20(weth).balanceOf(address(this));
            if (balanceWeth > 0) {
                IWETH(weth).withdraw(balanceWeth);
                _safeTransferETH(sender, balanceWeth);
            }

            address pairToken = (token0 == weth) ? token1 : token0;
            uint256 balanceToken = IERC20(pairToken).balanceOf(address(this));
            if (balanceToken > 0) {
                IERC20(pairToken).safeTransfer(sender, balanceToken);
            }
        }
    }

    /**
     * @notice Decreases liquidity for underlying Uniswap V3 NFT LP and validates
     * that the user respects liquidation checks.
     * @dev Pool must be initialized already to add liquidity
     * @param tokenId The id of the erc721 token
     * @param liquidityDecrease The amount of liquidity to remove of LP
     * @param amount0Min The minimum amount to remove of token0
     * @param amount1Min The minimum amount to remove of token1
     */
    function decreaseUniswapV3Liquidity(
        uint256 tokenId,
        uint128 liquidityDecrease,
        uint256 amount0Min,
        uint256 amount1Min,
        bool receiveEthAsWeth
    ) external {
        // only the token owner of the NToken can decrease the underlying
        address sender = _msgSender();
        require(sender == ownerOf(tokenId), Errors.NOT_THE_OWNER);

        // interact with Uniswap V3
        _decreaseLiquidity(
            tokenId,
            liquidityDecrease,
            amount0Min,
            amount1Min,
            receiveEthAsWeth
        );

        // return data about the users healthFactor after decrease
        (, , , , , uint256 healthFactor, ) = POOL.getUserAccountData(sender);

        // revert if decrease would result in a liquidation
        require(
            healthFactor > HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
            Errors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
        );
    }

    function _safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "ETH_TRANSFER_FAILED");
    }

    receive() external payable {}
}
