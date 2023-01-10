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
import {XTokenType} from "../../interfaces/IXTokenType.sol";
import {INTokenUniswapV3} from "../../interfaces/INTokenUniswapV3.sol";

/**
 * @title UniswapV3 NToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract NTokenUniswapV3 is NToken, INTokenUniswapV3 {
    using SafeERC20 for IERC20;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool) NToken(pool, true) {
        _ERC721Data.balanceLimit = 5;
    }

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenUniswapV3;
    }

    /**
     * @notice A function that decreases the current liquidity.
     * @param tokenId The id of the erc721 token
     * @param liquidityDecrease The amount of liquidity to remove of LP
     * @param amount0Min The minimum amount to remove of token0
     * @param amount1Min The minimum amount to remove of token1
     * @param receiveETH If convert weth to ETH
     */
    function decreaseUniswapV3Liquidity(
        address user,
        uint256 tokenId,
        uint128 liquidityDecrease,
        uint256 amount0Min,
        uint256 amount1Min,
        bool receiveETH
    ) external onlyPool nonReentrant {
        require(user == ownerOf(tokenId), Errors.NOT_THE_OWNER);

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
        (token0, token1) = receiveETH && token1 == weth
            ? (token1, token0)
            : (token0, token1);
        receiveETH = receiveETH && token0 == weth;
        (uint256 balance0Before, uint256 balance1Before) = receiveETH
            ? (
                IERC20(token0).balanceOf(address(this)),
                IERC20(token1).balanceOf(address(this))
            )
            : (0, 0);

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

        INonfungiblePositionManager.CollectParams
            memory collectParams = INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: receiveETH ? address(this) : user,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        INonfungiblePositionManager(_underlyingAsset).collect(collectParams);

        if (receiveETH) {
            uint256 balance0Diff = IERC20(token0).balanceOf(address(this)) -
                balance0Before;
            if (balance0Diff > 0) {
                IWETH(token0).withdraw(balance0Diff);
                _safeTransferETH(user, balance0Diff);
            }

            uint256 balance1Diff = IERC20(token1).balanceOf(address(this)) -
                balance1Before;
            if (balance1Diff > 0) {
                IERC20(token1).safeTransfer(user, balance1Diff);
            }
        }
    }

    function _safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "ETH_TRANSFER_FAILED");
    }

    receive() external payable {}
}
