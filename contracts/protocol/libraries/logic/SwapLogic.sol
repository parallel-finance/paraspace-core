// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";
import {GPv2SafeERC20} from "../../../dependencies/gnosis/contracts/GPv2SafeERC20.sol";
import {IPToken} from "../../../interfaces/IPToken.sol";
import {UserConfiguration} from "../configuration/UserConfiguration.sol";
import {DataTypes} from "../types/DataTypes.sol";
import {WadRayMath} from "../math/WadRayMath.sol";
import {ValidationLogic} from "./ValidationLogic.sol";
import {ReserveLogic} from "./ReserveLogic.sol";
import {ISwapAdapter} from "../../../interfaces/ISwapAdapter.sol";
import {SupplyLogic} from "./SupplyLogic.sol";
import {BorrowLogic} from "./BorrowLogic.sol";
import {IVariableDebtToken} from "../../../interfaces/IVariableDebtToken.sol";
import {Helpers} from "../helpers/Helpers.sol";

/**
 * @title SwapLogic library
 *
 * @notice Implements the xtoken swap logic
 */
library SwapLogic {
    using ReserveLogic for DataTypes.ReserveData;
    using GPv2SafeERC20 for IERC20;
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using WadRayMath for uint256;

    event ReserveUsedAsCollateralDisabled(
        address indexed reserve,
        address indexed user
    );
    event SwapPToken(
        address indexed srcReserve,
        address indexed dstReserve,
        address indexed user,
        uint256 srcAmount,
        uint256 dstAmount
    );
    event SwapDebt(
        address indexed srcReserve,
        address indexed dstReserve,
        address indexed user,
        uint256 srcAmount,
        uint256 dstAmount
    );

    /**
     * @notice Implements the ptoken swap feature. Through `atomicSwap()`, users redeem their xTokens for the underlying asset
     * previously supplied in the ParaSpace protocol.
     * @dev Emits the `Swap()` event.
     * @dev If the user swap everything, `ReserveUsedAsCollateralDisabled()` is emitted.
     * @param ps The pool storage pointer
     * @param userConfig The user configuration mapping that tracks the supplied/borrowed assets
     * @param params The additional parameters needed to execute the swap function
     */
    function executeSwapPToken(
        DataTypes.PoolStorage storage ps,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteSwapParams memory params
    ) external {
        DataTypes.ReserveData storage reserve = ps._reserves[params.srcAsset];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        reserve.updateState(reserveCache);

        uint256 userBalance = IPToken(reserveCache.xTokenAddress)
            .scaledBalanceOf(msg.sender)
            .rayMul(reserveCache.nextLiquidityIndex);

        uint256 amountToSwap = params.amount;

        ValidationLogic.validateWithdraw(
            reserveCache,
            amountToSwap,
            userBalance
        );

        reserve.updateInterestRates(
            reserveCache,
            params.srcAsset,
            0,
            amountToSwap
        );

        DataTypes.TimeLockParams memory timeLockParams;
        DataTypes.SwapInfo memory swapInfo = ISwapAdapter(
            params.swapAdapter.adapter
        ).getSwapInfo(params.swapPayload, true);
        ValidationLogic.validateSwap(
            swapInfo,
            DataTypes.ValidateSwapParams({
                swapAdapter: params.swapAdapter,
                amount: amountToSwap,
                srcToken: params.srcAsset,
                dstToken: params.dstAsset,
                dstReceiver: reserveCache.xTokenAddress
            })
        );
        uint256 amountOut = IPToken(reserveCache.xTokenAddress)
            .swapUnderlyingTo(
                address(this),
                timeLockParams,
                params.swapAdapter,
                params.swapPayload,
                swapInfo
            );
        IPToken(reserveCache.xTokenAddress).burn(
            msg.sender,
            reserveCache.xTokenAddress,
            amountToSwap,
            reserveCache.nextLiquidityIndex,
            timeLockParams
        );

        SupplyLogic.executeSupply(
            ps._reserves,
            ps._usersConfig[params.user],
            DataTypes.ExecuteSupplyParams({
                asset: params.dstAsset,
                amount: amountOut,
                onBehalfOf: params.user,
                payer: address(this),
                referralCode: 0
            })
        );

        if (userConfig.isUsingAsCollateral(reserve.id)) {
            Helpers.setAssetUsedAsCollateral(
                ps._usersConfig[params.user],
                ps._reserves,
                params.dstAsset,
                params.user
            );

            if (userConfig.isBorrowingAny()) {
                ValidationLogic.validateHFAndLtvERC20(
                    ps._reserves,
                    ps._reservesList,
                    userConfig,
                    params.srcAsset,
                    msg.sender,
                    params.reservesCount,
                    params.oracle
                );
            }

            if (amountToSwap == userBalance) {
                userConfig.setUsingAsCollateral(reserve.id, false);
                emit ReserveUsedAsCollateralDisabled(
                    params.srcAsset,
                    msg.sender
                );
            }
        }

        emit SwapPToken(
            params.srcAsset,
            params.dstAsset,
            msg.sender,
            amountToSwap,
            amountOut
        );
    }

    function executeSwapDebt(
        DataTypes.PoolStorage storage ps,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteSwapParams memory params
    ) external {
        DataTypes.ReserveData storage reserve = ps._reserves[params.dstAsset];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        reserve.updateState(reserveCache);

        uint256 amountToSwap = params.amount;

        DataTypes.TimeLockParams memory timeLockParams;
        DataTypes.SwapInfo memory swapInfo = ISwapAdapter(
            params.swapAdapter.adapter
        ).getSwapInfo(params.swapPayload, false);
        ValidationLogic.validateSwap(
            swapInfo,
            DataTypes.ValidateSwapParams({
                swapAdapter: params.swapAdapter,
                amount: amountToSwap,
                srcToken: params.dstAsset,
                dstToken: params.srcAsset,
                dstReceiver: reserveCache.xTokenAddress
            })
        );
        uint256 amountIn = IPToken(reserveCache.xTokenAddress).swapUnderlyingTo(
            address(this),
            timeLockParams,
            params.swapAdapter,
            params.swapPayload,
            swapInfo
        );

        bool isFirstBorrowing = false;
        (
            isFirstBorrowing,
            reserveCache.nextScaledVariableDebt
        ) = IVariableDebtToken(reserveCache.variableDebtTokenAddress).mint(
            params.user,
            params.user,
            amountIn,
            reserveCache.nextVariableBorrowIndex
        );

        reserve.updateInterestRates(reserveCache, params.dstAsset, 0, 0);

        if (isFirstBorrowing) {
            userConfig.setBorrowing(reserve.id, true);
        }

        BorrowLogic.executeRepay(
            ps._reserves,
            ps._usersConfig[params.user],
            DataTypes.ExecuteRepayParams({
                asset: params.srcAsset,
                amount: amountToSwap,
                onBehalfOf: params.user,
                payer: address(this),
                usePTokens: false
            })
        );

        ValidationLogic.validateBorrow(
            ps._reserves,
            ps._reservesList,
            DataTypes.ValidateBorrowParams({
                reserveCache: reserveCache,
                userConfig: userConfig,
                asset: params.dstAsset,
                userAddress: params.user,
                amount: amountIn,
                reservesCount: params.reservesCount,
                oracle: params.oracle,
                priceOracleSentinel: params.priceOracleSentinel
            })
        );

        emit SwapDebt(
            params.srcAsset,
            params.dstAsset,
            params.user,
            amountToSwap,
            amountIn
        );
    }
}
