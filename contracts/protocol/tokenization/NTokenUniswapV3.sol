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
import {PercentageMath} from "../libraries/math/PercentageMath.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {NToken} from "./NToken.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {INonfungiblePositionManager} from "../../dependencies/uniswap/INonfungiblePositionManager.sol";
import {IWETH} from "../../misc/interfaces/IWETH.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";
import {INTokenUniswapV3} from "../../interfaces/INTokenUniswapV3.sol";
import {IUniswapV3OracleWrapper} from "../../interfaces/IUniswapV3OracleWrapper.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";
import {ReserveConfiguration} from "../libraries/configuration/ReserveConfiguration.sol";

/**
 * @title UniswapV3 NToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract NTokenUniswapV3 is NToken, INTokenUniswapV3 {
    using SafeERC20 for IERC20;
    using PercentageMath for uint256;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;

    bytes32 constant UNISWAPV3_DATA_STORAGE_POSITION =
        bytes32(
            uint256(keccak256("paraspace.proxy.ntoken.uniswapv3.storage")) - 1
        );

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool) NToken(pool, true) {
        _ERC721Data.balanceLimit = 30;
    }

    function initialize(
        IPool initializingPool,
        address underlyingAsset,
        IRewardController incentivesController,
        string calldata nTokenName,
        string calldata nTokenSymbol,
        bytes calldata params
    ) public virtual override initializer {
        super.initialize(initializingPool, underlyingAsset, incentivesController, nTokenName, nTokenSymbol, params);
        address[] memory reserveList = POOL.getReservesList();
        for (uint256 index = 0; index < reserveList.length; index++) {
            DataTypes.ReserveConfigurationMap memory poolConfiguration = POOL.getReserveData(reserveList[index]).configuration;
            if (poolConfiguration.getAssetType() == DataTypes.AssetType.ERC20) {
                IERC20(reserveList[index]).approve(_underlyingAsset, type(uint128).max);
            }
        }
    }

    struct UniswapV3Storage {
        uint256 compoundIncentive;
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
     * @param receiveEthAsWeth If convert weth to ETH
     * @return amount0 The amount received back in token0
     * @return amount1 The amount returned back in token1
     */
    function _decreaseLiquidity(
        address user,
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

        INonfungiblePositionManager.CollectParams
            memory collectParams = INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: receiveEthAsWeth ? address(this) : user,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        (amount0, amount1) = INonfungiblePositionManager(_underlyingAsset)
            .collect(collectParams);

        if (receiveEthAsWeth) {
            uint256 balanceWeth = IERC20(weth).balanceOf(address(this));
            if (balanceWeth > 0) {
                IWETH(weth).withdraw(balanceWeth);
                _safeTransferETH(user, balanceWeth);
            }

            address pairToken = (token0 == weth) ? token1 : token0;
            uint256 balanceToken = IERC20(pairToken).balanceOf(address(this));
            if (balanceToken > 0) {
                IERC20(pairToken).safeTransfer(user, balanceToken);
            }
        }
    }

    /// @inheritdoc INTokenUniswapV3
    function decreaseUniswapV3Liquidity(
        address user,
        uint256 tokenId,
        uint128 liquidityDecrease,
        uint256 amount0Min,
        uint256 amount1Min,
        bool receiveEthAsWeth
    ) external onlyPool nonReentrant {
        require(user == ownerOf(tokenId), Errors.NOT_THE_OWNER);

        // interact with Uniswap V3
        _decreaseLiquidity(
            user,
            tokenId,
            liquidityDecrease,
            amount0Min,
            amount1Min,
            receiveEthAsWeth
        );
    }

    function setCompoundIncentive(uint256 incentive) external onlyPoolAdmin {
        UniswapV3Storage storage uniV3Storage = uinswapV3DataStorage();

        uniV3Storage.compoundIncentive = incentive;
    }

    function uinswapV3DataStorage()
        internal
        pure
        returns (UniswapV3Storage storage rgs)
    {
        bytes32 position = UNISWAPV3_DATA_STORAGE_POSITION;
        assembly {
            rgs.slot := position
        }
    }

    function collectSupplyUniswapV3Fees(
        address user,
        uint256 tokenId,
        address incentiveReceiver
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

        uint256 token0BalanceBefore = IERC20(token0).balanceOf(address(this));
        uint256 token1BalanceBefore = IERC20(token1).balanceOf(address(this));

        INonfungiblePositionManager.CollectParams
            memory collectParams = INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        (uint256 amount0, uint256 amount1) = INonfungiblePositionManager(
            _underlyingAsset
        ).collect(collectParams);

        if (incentiveReceiver != address(0)) {
            UniswapV3Storage storage uniV3Storage = uinswapV3DataStorage();

            uint256 compoundIncentive = uniV3Storage.compoundIncentive;

            if (compoundIncentive > 0) {
                if (amount0 > 0) {
                    uint256 incentiveAmount0 = amount0.percentMul(
                        compoundIncentive
                    );

                    IERC20(token0).safeTransfer(
                        incentiveReceiver,
                        incentiveAmount0
                    );
                    amount0 = amount0 - incentiveAmount0;
                }

                if (amount1 > 0) {
                    uint256 incentiveAmount1 = amount1.percentMul(
                        compoundIncentive
                    );

                    IERC20(token1).safeTransfer(
                        incentiveReceiver,
                        incentiveAmount1
                    );
                    amount1 = amount1 - incentiveAmount1;
                }
            }
        }

        INonfungiblePositionManager.IncreaseLiquidityParams
            memory params = INonfungiblePositionManager
                .IncreaseLiquidityParams({
                    tokenId: tokenId,
                    amount0Desired: amount0,
                    amount1Desired: amount1,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp
                });

        INonfungiblePositionManager(_underlyingAsset).increaseLiquidity(params);

        if (amount0 > 0) {
            uint256 token0BalanceAfter = IERC20(token0).balanceOf(
                address(this)
            );
            if (token0BalanceAfter > token0BalanceBefore) {
                POOL.supply(
                    token0,
                    token0BalanceAfter - token0BalanceBefore,
                    user,
                    0x0
                );
            }
        }

        if (amount1 > 0) {
            uint256 token1BalanceAfter = IERC20(token1).balanceOf(
                address(this)
            );
            if (token1BalanceAfter > token1BalanceBefore) {
                POOL.supply(
                    token1,
                    token1BalanceAfter - token1BalanceBefore,
                    user,
                    0x0
                );
            }
        }
    }

    function _safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "ETH_TRANSFER_FAILED");
    }

    receive() external payable {}
}
