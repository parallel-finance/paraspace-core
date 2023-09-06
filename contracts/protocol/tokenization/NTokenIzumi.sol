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
import {IBase} from "../../dependencies/izumi/izumi-swap-periphery/interfaces/IBase.sol";
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
    using SafeCast for uint256;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(
        IPool pool,
        address delegateRegistry
    ) NTokenLiquidity(pool, delegateRegistry) {}

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenIZUMILp;
    }

    function _underlyingAsset(
        address positionManager,
        uint256 tokenId
    ) internal view override returns (address token0, address token1) {
        ILiquidityManager POSITION_MANAGER = ILiquidityManager(positionManager);
        (, , , , , , , uint128 poolId) = POSITION_MANAGER.liquidities(tokenId);
        (token0, token1, ) = POSITION_MANAGER.poolMetas(poolId);
    }

    function _collect(
        address positionManager,
        uint256 tokenId
    ) internal override returns (uint256 amount0, uint256 amount1) {
        ILiquidityManager POSITION_MANAGER = ILiquidityManager(positionManager);

        (amount0, amount1) = POSITION_MANAGER.collect(
            address(POOL),
            tokenId,
            type(uint128).max,
            type(uint128).max
        );
    }

    function _increaseLiquidity(
        address positionManager,
        uint256 tokenId,
        uint256 amountAdd0,
        uint256 amountAdd1,
        uint256 amount0Min,
        uint256 amount1Min
    ) internal override returns (uint256 amount0, uint256 amount1) {
        ILiquidityManager POSITION_MANAGER = ILiquidityManager(positionManager);

        ILiquidityManager.AddLiquidityParam memory params = ILiquidityManager
            .AddLiquidityParam({
                lid: tokenId,
                xLim: amountAdd0.toUint128(),
                yLim: amountAdd1.toUint128(),
                amountXMin: amount0Min.toUint128(),
                amountYMin: amount1Min.toUint128(),
                deadline: block.timestamp
            });

        (, amount0, amount1) = POSITION_MANAGER.addLiquidity{value: msg.value}(
            params
        );
    }

    function _decreaseLiquidity(
        address positionManager,
        uint256 tokenId,
        uint128 liquidityDecrease,
        uint256 amount0Min,
        uint256 amount1Min
    ) internal override {
        ILiquidityManager POSITION_MANAGER = ILiquidityManager(positionManager);
        POSITION_MANAGER.decLiquidity(
            tokenId,
            liquidityDecrease,
            amount0Min,
            amount1Min,
            block.timestamp
        );
    }

    function _refundETH(address positionManager) internal override {
        IBase(positionManager).refundETH();
    }
}
