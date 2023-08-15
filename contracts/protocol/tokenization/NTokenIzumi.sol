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
import {ILiquidityManager} from "../../dependencies/izumi/izumi-swap-periphery/interfaces/ILiquidityManager.sol";
import {IWETH} from "../../misc/interfaces/IWETH.sol";
import {Helpers} from "../../protocol/libraries/helpers/Helpers.sol";
import {NTokenLiquidity} from "./NTokenLiquidity.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";

/**
 * @title IZUMI NToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract NTokenIzumi is NTokenLiquidity {
    using SafeERC20 for IERC20;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool, address delegateRegistry)
        NTokenLiquidity(pool, delegateRegistry)
    {}

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenIZUMILp;
    }

    function underlyingAsset(uint256 tokenId)
        external
        view
        returns (address token0, address token1)
    {
        ILiquidityManager POSITION_MANAGER = ILiquidityManager(
            _ERC721Data.underlyingAsset
        );
        (, , , , , , , uint128 poolId) = POSITION_MANAGER.liquidities(tokenId);
        (token0, token1, ) = POSITION_MANAGER.poolMetas(poolId);
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
        ILiquidityManager POSITION_MANAGER = ILiquidityManager(
            _ERC721Data.underlyingAsset
        );
        if (liquidityDecrease > 0) {
            POSITION_MANAGER.decLiquidity(
                tokenId,
                liquidityDecrease,
                amount0Min,
                amount1Min,
                block.timestamp
            );
        }

        (, , , , , , , uint128 poolId) = POSITION_MANAGER.liquidities(tokenId);
        (address token0, address token1, ) = POSITION_MANAGER.poolMetas(poolId);

        address weth = _addressesProvider.getWETH();
        receiveEth = (receiveEth && (token0 == weth || token1 == weth));

        (uint256 amount0, uint256 amount1) = POSITION_MANAGER.collect(
            receiveEth ? address(this) : user,
            tokenId,
            type(uint128).max,
            type(uint128).max
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
