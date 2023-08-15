// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

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
import {INonfungiblePositionManager} from "../../dependencies/uniswapv3-periphery/interfaces/INonfungiblePositionManager.sol";
import {IWETH} from "../../misc/interfaces/IWETH.sol";
import {Helpers} from "../../protocol/libraries/helpers/Helpers.sol";
import {NTokenLiquidity} from "./NTokenLiquidity.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";

/**
 * @title UniswapV3 NToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract NTokenUniswapV3 is NTokenLiquidity {
    using SafeERC20 for IERC20;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool, address delegateRegistry)
        NTokenLiquidity(pool, delegateRegistry)
    {}

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenUniswapV3;
    }

    /**
     * @notice A function that decreases the current liquidity.
     * @param tokenId The id of the erc721 token
     * @param liquidityDecrease The amount of liquidity to remove of LP
     * @param amount0Min The minimum amount to remove of token0
     * @param amount1Min The minimum amount to remove of token1
     * @param receiveEth If convert weth to ETH
     */
    function _decreaseLiquidity(
        address user,
        uint256 tokenId,
        uint128 liquidityDecrease,
        uint256 amount0Min,
        uint256 amount1Min,
        bool receiveEth
    ) internal override {
        INonfungiblePositionManager positionManager = INonfungiblePositionManager(
                _ERC721Data.underlyingAsset
            );
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

            positionManager.decreaseLiquidity(params);
        }

        (, , address token0, address token1, , , , , , , , ) = positionManager
            .positions(tokenId);

        address weth = _addressesProvider.getWETH();
        receiveEth = (receiveEth &&
            (token0 == weth || token1 == weth));

        INonfungiblePositionManager.CollectParams
            memory collectParams = INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: receiveEth ? address(this) : user,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        (uint256 amount0, uint256 amount1) = positionManager.collect(
            collectParams
        );

        if (receiveEth) {
            if (amount0 > 0) {
                transferTokenOut(user, token0, amount0, weth);
            }
            if (amount1 > 0) {
                transferTokenOut(user, token1, amount1, weth);
            }
        }
    }
}
