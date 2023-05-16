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
    event Swap(
        address indexed srcReserve,
        address indexed dstReserve,
        address indexed user,
        address to,
        uint256 srcAmount,
        uint256 dstAmount
    );

    /**
     * @notice Implements the ptoken swap feature. Through `atomicSwap()`, users redeem their xTokens for the underlying asset
     * previously supplied in the ParaSpace protocol.
     * @dev Emits the `Swap()` event.
     * @dev If the user swap everything, `ReserveUsedAsCollateralDisabled()` is emitted.
     * @param ps The pool storage pointer
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param userConfig The user configuration mapping that tracks the supplied/borrowed assets
     * @param params The additional parameters needed to execute the swap function
     * @return The actual amount swapped
     */
    function executeSwap(
        DataTypes.PoolStorage storage ps,
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteSwapParams memory params
    ) external returns (uint256) {
        DataTypes.ReserveData storage reserve = reservesData[params.srcAsset];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        reserve.updateState(reserveCache);

        uint256 userBalance = IPToken(reserveCache.xTokenAddress)
            .scaledBalanceOf(msg.sender)
            .rayMul(reserveCache.nextLiquidityIndex);

        uint256 amountToSwap = params.srcAmount;

        if (params.srcAmount == type(uint256).max) {
            amountToSwap = userBalance;
        }

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
        ).getSwapInfo(params.swapPayload);
        ValidationLogic.validateSwap(
            swapInfo,
            DataTypes.ValidateSwapParams({
                swapAdapter: params.swapAdapter,
                amount: params.srcAmount,
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
                swapInfo,
                type(uint256).max
            );

        SupplyLogic.executeSupply(
            reservesData,
            ps._usersConfig[params.to],
            DataTypes.ExecuteSupplyParams({
                asset: params.dstAsset,
                amount: amountOut,
                onBehalfOf: params.to,
                payer: address(this),
                referralCode: 0
            })
        );

        if (userConfig.isUsingAsCollateral(reserve.id)) {
            if (userConfig.isBorrowingAny()) {
                ValidationLogic.validateHFAndLtvERC20(
                    reservesData,
                    reservesList,
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

        return amountToSwap;
    }
}
