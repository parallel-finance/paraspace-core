// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {ParaVersionedInitializable} from "../libraries/paraspace-upgradeability/ParaVersionedInitializable.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {ReserveConfiguration} from "../libraries/configuration/ReserveConfiguration.sol";
import {ParaReentrancyGuard} from "../libraries/paraspace-upgradeability/ParaReentrancyGuard.sol";
import {PoolStorage} from "./PoolStorage.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {INToken} from "../../interfaces/INToken.sol";
import {INTokenLiquidity} from "../../interfaces/INTokenLiquidity.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";
import {ILiquidityManager} from "../../dependencies/izumi/izumi-swap-periphery/interfaces/ILiquidityManager.sol";
import {INonfungiblePositionManager} from "../../dependencies/uniswapv3-periphery/interfaces/INonfungiblePositionManager.sol";
import {ValidationLogic} from "../libraries/logic/ValidationLogic.sol";
import {BorrowLogic} from "../libraries/logic/BorrowLogic.sol";
import {SupplyLogic} from "../libraries/logic/SupplyLogic.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IPToken} from "../../interfaces/IPToken.sol";
import {ReserveLogic} from "../libraries/logic/ReserveLogic.sol";
import {ReserveConfiguration} from "../libraries/configuration/ReserveConfiguration.sol";
import {SafeCast} from "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {UserConfiguration} from "../libraries/configuration/UserConfiguration.sol";
import {GenericLogic} from "../libraries/logic/GenericLogic.sol";
import {Math} from "../../dependencies/openzeppelin/contracts/Math.sol";
import {Helpers} from "../libraries/helpers/Helpers.sol";
import "../../interfaces/IPoolLpOperation.sol";

contract PoolLpOperation is
    ParaVersionedInitializable,
    ParaReentrancyGuard,
    PoolStorage,
    IPoolLpOperation
{
    using SafeCast for uint256;
    using SafeERC20 for IERC20;
    using ReserveLogic for DataTypes.ReserveData;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using UserConfiguration for DataTypes.UserConfigurationMap;

    event ReserveUsedAsCollateralDisabled(
        address indexed reserve,
        address indexed user
    );

    event SupplyERC721(
        address indexed reserve,
        address user,
        address indexed onBehalfOf,
        DataTypes.ERC721SupplyParams[] tokenData,
        uint16 indexed referralCode,
        bool fromNToken
    );

    uint256 internal constant POOL_REVISION = 200;
    IPoolAddressesProvider internal immutable ADDRESSES_PROVIDER;

    /**
     * @dev Constructor.
     * @param provider The address of the PoolAddressesProvider contract
     */
    constructor(IPoolAddressesProvider provider) {
        ADDRESSES_PROVIDER = provider;
    }

    function getRevision() internal pure virtual override returns (uint256) {
        return POOL_REVISION;
    }

    struct LpPositionVars {
        address token0XToken;
        address token1XToken;
        uint256 token0Before;
        uint256 token1Before;
        uint256 token0After;
        uint256 token1After;
        uint256 token0Left;
        uint256 token1Left;
        uint256 token0RefundBorrow;
        uint256 token1RefundBorrow;
        uint256 token0Borrow;
        uint256 token1Borrow;
        uint256 token0RefundCash;
        uint256 token1RefundCash;
        uint256 token0RefundDecreaseLiquidity;
        uint256 token1RefundDecreaseLiquidity;
    }

    function adjustLpPosition(
        DataTypes.AssetInfo calldata assetInfo,
        DataTypes.DecreaseLiquidityParam calldata decreaseLiquidityParam,
        DataTypes.MintParams calldata mintParams
    ) external virtual override nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();

        DataTypes.ReserveData storage reserve = ps._reserves[assetInfo.asset];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        //currently don't need to update state for erc721
        //reserve.updateState(reserveCache);
        XTokenType tokenType = INToken(reserveCache.xTokenAddress)
            .getXTokenType();
        require(
            tokenType == XTokenType.NTokenUniswapV3 ||
                tokenType == XTokenType.NTokenIZUMILp,
            Errors.XTOKEN_TYPE_NOT_ALLOWED
        );

        //check asset status
        ValidationLogic.validateAssetStatus(
            reserveCache.reserveConfiguration,
            DataTypes.AssetType.ERC721
        );
        if (
            decreaseLiquidityParam.liquidityDecrease == 0 ||
            !decreaseLiquidityParam.burnNFT
        ) {
            //need check supply cap
            uint256 supplyCap = reserveCache
                .reserveConfiguration
                .getSupplyCap();
            require(
                supplyCap == 0 ||
                    (INToken(reserveCache.xTokenAddress).totalSupply() + 1 <=
                        supplyCap),
                Errors.SUPPLY_CAP_EXCEEDED
            );
        }

        //check underlying asset status
        ValidationLogic.validateAssetStatus(
            ps._reserves[assetInfo.token0].configuration,
            DataTypes.AssetType.ERC20
        );
        ValidationLogic.validateAssetStatus(
            ps._reserves[assetInfo.token1].configuration,
            DataTypes.AssetType.ERC20
        );

        LpPositionVars memory vars;
        vars.token0Before = IERC20(assetInfo.token0).balanceOf(address(this));
        vars.token1Before = IERC20(assetInfo.token1).balanceOf(address(this));
        if (assetInfo.token0BorrowAmount > 0) {
            vars.token0XToken = ps._reserves[assetInfo.token0].xTokenAddress;
        }
        if (assetInfo.token1BorrowAmount > 0) {
            vars.token1XToken = ps._reserves[assetInfo.token1].xTokenAddress;
        }

        //handle cash and borrow part asset
        _transferInAsset(
            assetInfo.token0,
            msg.sender,
            assetInfo.token0CashAmount
        );
        _transferInAsset(
            assetInfo.token1,
            msg.sender,
            assetInfo.token1CashAmount
        );
        _flashBorrowAsset(vars.token0XToken, assetInfo.token0BorrowAmount);
        _flashBorrowAsset(vars.token1XToken, assetInfo.token1BorrowAmount);

        //decrease liquidity
        if (decreaseLiquidityParam.liquidityDecrease > 0) {
            (
                address token0,
                address token1,
                ,
                ,
                bool isBurned
            ) = INTokenLiquidity(reserveCache.xTokenAddress).decreaseLiquidity(
                    msg.sender, //check owner here
                    decreaseLiquidityParam.tokenId,
                    decreaseLiquidityParam.liquidityDecrease,
                    decreaseLiquidityParam.amount0Min,
                    decreaseLiquidityParam.amount1Min
                );
            require(token0 == assetInfo.token0, Errors.INVALID_PARAMETER);
            require(token1 == assetInfo.token1, Errors.INVALID_PARAMETER);
            require(
                decreaseLiquidityParam.burnNFT == isBurned,
                Errors.INVALID_PARAMETER
            );
            if (isBurned) {
                DataTypes.TimeLockParams memory timeLockParams;
                uint256[] memory tokenIds = new uint256[](1);
                tokenIds[0] = decreaseLiquidityParam.tokenId;
                //we don't need care about collateral flag here since we'll set it to true anyway
                INToken(reserveCache.xTokenAddress).burn(
                    msg.sender,
                    reserveCache.xTokenAddress,
                    tokenIds,
                    timeLockParams
                );
            }
        }

        //mint new nft
        if (mintParams.amount0Desired > 0) {
            IERC20(assetInfo.token0).safeApprove(
                assetInfo.asset,
                mintParams.amount0Desired
            );
        }
        if (mintParams.amount1Desired > 0) {
            IERC20(assetInfo.token1).safeApprove(
                assetInfo.asset,
                mintParams.amount1Desired
            );
        }
        uint256 newTokenId;
        if (tokenType == XTokenType.NTokenUniswapV3) {
            INonfungiblePositionManager.MintParams
                memory params = INonfungiblePositionManager.MintParams({
                    token0: assetInfo.token0,
                    token1: assetInfo.token1,
                    fee: mintParams.fee,
                    tickLower: mintParams.tickLower,
                    tickUpper: mintParams.tickUpper,
                    amount0Desired: mintParams.amount0Desired,
                    amount1Desired: mintParams.amount1Desired,
                    amount0Min: mintParams.amount0Min,
                    amount1Min: mintParams.amount1Min,
                    recipient: reserveCache.xTokenAddress,
                    deadline: block.timestamp
                });
            (newTokenId, , , ) = INonfungiblePositionManager(assetInfo.asset)
                .mint(params);
        } else {
            // izumi
            ILiquidityManager.MintParam memory params = ILiquidityManager
                .MintParam({
                    miner: reserveCache.xTokenAddress,
                    tokenX: assetInfo.token0,
                    tokenY: assetInfo.token1,
                    fee: mintParams.fee,
                    pl: mintParams.tickLower,
                    pr: mintParams.tickUpper,
                    xLim: mintParams.amount0Desired.toUint128(),
                    yLim: mintParams.amount1Desired.toUint128(),
                    amountXMin: mintParams.amount0Min.toUint128(),
                    amountYMin: mintParams.amount1Min.toUint128(),
                    deadline: block.timestamp
                });
            (newTokenId, , , ) = ILiquidityManager(assetInfo.asset).mint(
                params
            );
        }
        if (mintParams.amount0Desired > 0) {
            IERC20(assetInfo.token0).safeApprove(assetInfo.asset, 0);
        }
        if (mintParams.amount1Desired > 0) {
            IERC20(assetInfo.token1).safeApprove(assetInfo.asset, 0);
        }

        //supply new mint nft
        {
            DataTypes.ERC721SupplyParams[]
                memory tokenData = new DataTypes.ERC721SupplyParams[](1);
            tokenData[0] = DataTypes.ERC721SupplyParams({
                tokenId: newTokenId,
                useAsCollateral: true
            });
            (
                uint64 oldCollateralizedBalance,
                uint64 newCollateralizedBalance
            ) = INToken(reserveCache.xTokenAddress).mint(msg.sender, tokenData);
            bool isFirstSupplyCollateral = (oldCollateralizedBalance == 0 &&
                newCollateralizedBalance > 0);
            if (isFirstSupplyCollateral) {
                Helpers.setAssetUsedAsCollateral(
                    ps._usersConfig[msg.sender],
                    ps._reserves,
                    assetInfo.asset,
                    msg.sender
                );
            }

            emit SupplyERC721(
                assetInfo.asset,
                msg.sender,
                msg.sender,
                tokenData,
                0,
                false
            );
        }

        //calculate refund amount
        vars.token0After = IERC20(assetInfo.token0).balanceOf(address(this));
        vars.token1After = IERC20(assetInfo.token1).balanceOf(address(this));
        require(
            vars.token0After >= vars.token0Before,
            Errors.INVALID_PARAMETER
        );
        require(
            vars.token1After >= vars.token1Before,
            Errors.INVALID_PARAMETER
        );

        //calculate refund borrow
        vars.token0Left = vars.token0After - vars.token0Before;
        vars.token1Left = vars.token1After - vars.token1Before;
        if (vars.token0Left > 0) {
            vars.token0RefundBorrow = Math.min(
                vars.token0Left,
                assetInfo.token0BorrowAmount
            );

            //calculate refund cash
            vars.token0Left = vars.token0Left - vars.token0RefundBorrow;

            if (vars.token0Left > 0) {
                vars.token0RefundCash = Math.min(
                    vars.token0Left,
                    assetInfo.token0CashAmount
                );

                //calculate refund decreaseLiquidity
                vars.token0RefundDecreaseLiquidity =
                    vars.token0Left -
                    vars.token0RefundCash;
            }
        }
        if (vars.token1Left > 0) {
            vars.token1RefundBorrow = Math.min(
                vars.token1Left,
                assetInfo.token1BorrowAmount
            );

            vars.token1Left = vars.token1Left - vars.token1RefundBorrow;

            if (vars.token1Left > 0) {
                vars.token1RefundCash = Math.min(
                    vars.token1Left,
                    assetInfo.token1CashAmount
                );
                vars.token1RefundDecreaseLiquidity =
                    vars.token1Left -
                    vars.token1RefundCash;
            }
        }
        vars.token0Borrow =
            assetInfo.token0BorrowAmount -
            vars.token0RefundBorrow;
        vars.token1Borrow =
            assetInfo.token1BorrowAmount -
            vars.token1RefundBorrow;

        //do refund
        {
            //refund borrow
            _refundAsset(
                assetInfo.token0,
                vars.token0XToken,
                vars.token0RefundBorrow
            );
            _refundAsset(
                assetInfo.token1,
                vars.token1XToken,
                vars.token1RefundBorrow
            );

            //refund cash
            _refundAsset(assetInfo.token0, msg.sender, vars.token0RefundCash);
            _refundAsset(assetInfo.token1, msg.sender, vars.token1RefundCash);

            //refund decreaseLiquidity
            _supplyLiquidity(
                ps._reserves,
                ps._usersConfig[msg.sender],
                msg.sender,
                assetInfo.token0,
                vars.token0RefundDecreaseLiquidity
            );
            _supplyLiquidity(
                ps._reserves,
                ps._usersConfig[msg.sender],
                msg.sender,
                assetInfo.token1,
                vars.token1RefundDecreaseLiquidity
            );
        }

        //execute borrow
        if (vars.token0Borrow > 0) {
            _executeBorrow(
                ps,
                msg.sender,
                assetInfo.token0,
                vars.token0Borrow,
                !(vars.token1Borrow > 0)
            );
        }
        if (vars.token1Borrow > 0) {
            _executeBorrow(
                ps,
                msg.sender,
                assetInfo.token1,
                vars.token1Borrow,
                true
            );
        }
    }

    function _transferInAsset(
        address asset,
        address user,
        uint256 amount
    ) internal {
        if (amount > 0) {
            IERC20(asset).safeTransferFrom(user, address(this), amount);
        }
    }

    function _flashBorrowAsset(address assetPToken, uint256 amount) internal {
        if (amount > 0) {
            DataTypes.TimeLockParams memory timeLockParams;
            IPToken(assetPToken).transferUnderlyingTo(
                address(this),
                amount,
                timeLockParams
            );
        }
    }

    function _executeBorrow(
        DataTypes.PoolStorage storage ps,
        address user,
        address asset,
        uint256 amount,
        bool verifyCollateral
    ) internal {
        BorrowLogic.executeBorrow(
            ps._reserves,
            ps._reservesList,
            ps._usersConfig[user],
            DataTypes.ExecuteBorrowParams({
                asset: asset,
                user: user,
                onBehalfOf: user,
                amount: amount,
                referralCode: 0,
                releaseUnderlying: false,
                reservesCount: ps._reservesCount,
                oracle: ADDRESSES_PROVIDER.getPriceOracle(),
                priceOracleSentinel: ADDRESSES_PROVIDER
                    .getPriceOracleSentinel(),
                verifyCollateral: verifyCollateral
            })
        );
    }

    function _refundAsset(
        address asset,
        address user,
        uint256 amount
    ) internal {
        if (amount > 0) {
            IERC20(asset).safeTransfer(user, amount);
        }
    }

    function _supplyLiquidity(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        DataTypes.UserConfigurationMap storage userConfig,
        address user,
        address asset,
        uint256 amount
    ) internal {
        if (amount > 0) {
            SupplyLogic.executeSupply(
                reservesData,
                userConfig,
                DataTypes.ExecuteSupplyParams({
                    asset: asset,
                    amount: amount,
                    onBehalfOf: user,
                    payer: address(this),
                    referralCode: 0
                })
            );

            Helpers.setAssetUsedAsCollateral(
                userConfig,
                reservesData,
                asset,
                user
            );
        }
    }
}
