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
    constructor(
        IPool pool,
        address delegateRegistry
    ) NTokenLiquidity(pool, delegateRegistry) {}

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenUniswapV3;
    }

    function _underlyingAsset(
        address positionManager,
        uint256 tokenId
    ) internal view override returns (address token0, address token1) {
        (, , token0, token1, , , , , , , , ) = INonfungiblePositionManager(
            positionManager
        ).positions(tokenId);
    }

    function _collect(
        address positionManager,
        uint256 tokenId
    ) internal override returns (uint256 amount0, uint256 amount1) {
        INonfungiblePositionManager.CollectParams
            memory collectParams = INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(POOL),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        (amount0, amount1) = INonfungiblePositionManager(positionManager)
            .collect(collectParams);
    }

    function _increaseLiquidity(
        address positionManager,
        uint256 tokenId,
        uint256 amountAdd0,
        uint256 amountAdd1,
        uint256 amount0Min,
        uint256 amount1Min
    ) internal override returns (uint256 amount0, uint256 amount1) {
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

        (, amount0, amount1) = INonfungiblePositionManager(positionManager)
            .increaseLiquidity{value: msg.value}(params);
    }

    function _liquidity(
        address positionManager,
        uint256 tokenId
    ) internal view override returns (uint256) {
        (, , , , , , , uint256 liquidity, , , , ) = INonfungiblePositionManager(
            positionManager
        ).positions(tokenId);
        return liquidity;
    }

    function _burn(address positionManager, uint256 tokenId) internal override {
        INonfungiblePositionManager(positionManager).burn(tokenId);
    }

    function _decreaseLiquidity(
        address positionManager,
        uint256 tokenId,
        uint128 liquidityDecrease,
        uint256 amount0Min,
        uint256 amount1Min
    ) internal override {
        INonfungiblePositionManager.DecreaseLiquidityParams
            memory params = INonfungiblePositionManager
                .DecreaseLiquidityParams({
                    tokenId: tokenId,
                    liquidity: liquidityDecrease,
                    amount0Min: amount0Min,
                    amount1Min: amount1Min,
                    deadline: block.timestamp
                });

        INonfungiblePositionManager(positionManager).decreaseLiquidity(params);
    }

    function _refundETH(address positionManager) internal override {
        INonfungiblePositionManager(positionManager).refundETH();
    }
}
