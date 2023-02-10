// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.10;

import {INToken} from "../../../interfaces/INToken.sol";
import {ICollateralizableERC721} from "../../../interfaces/ICollateralizableERC721.sol";
import {Errors} from "../helpers/Errors.sol";
import {UserConfiguration} from "../configuration/UserConfiguration.sol";
import {DataTypes} from "../types/DataTypes.sol";
import {ValidationLogic} from "./ValidationLogic.sol";
import {ReserveLogic} from "./ReserveLogic.sol";
import {GenericLogic} from "./GenericLogic.sol";
import {XTokenType} from "../../../interfaces/IXTokenType.sol";
import {INTokenUniswapV3} from "../../../interfaces/INTokenUniswapV3.sol";

/**
 * @title UniswapV3Logic library
 *
 * @notice Implements the base logic for UniswapV3
 */
library UniswapV3Logic {
    using ReserveLogic for DataTypes.ReserveData;
    using UserConfiguration for DataTypes.UserConfigurationMap;

    event CollectSupplyUniswapV3Fees(uint256 tokenId);

    function executeDecreaseUniswapV3Liquidity(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteDecreaseUniswapV3LiquidityParams memory params
    ) external {
        DataTypes.ReserveData storage reserve = reservesData[params.asset];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        //currently don't need to update state for erc721
        //reserve.updateState(reserveCache);

        INToken nToken = INToken(reserveCache.xTokenAddress);
        require(
            nToken.getXTokenType() == XTokenType.NTokenUniswapV3,
            Errors.ONLY_UNIV3_ALLOWED
        );

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = params.tokenId;
        ValidationLogic.validateWithdrawERC721(
            reservesData,
            reserveCache,
            params.asset,
            tokenIds
        );

        INTokenUniswapV3(reserveCache.xTokenAddress).decreaseUniswapV3Liquidity(
                params.user,
                params.tokenId,
                params.liquidityDecrease,
                params.amount0Min,
                params.amount1Min,
                params.receiveEthAsWeth
            );

        bool isUsedAsCollateral = ICollateralizableERC721(
            reserveCache.xTokenAddress
        ).isUsedAsCollateral(params.tokenId);
        if (isUsedAsCollateral) {
            if (userConfig.isBorrowingAny()) {
                ValidationLogic.validateHFAndLtvERC721(
                    reservesData,
                    reservesList,
                    userConfig,
                    params.asset,
                    tokenIds,
                    params.user,
                    params.reservesCount,
                    params.oracle
                );
            }
        }
    }

    function executeCollectSupplyUniswapV3Fees(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteCollectAndSupplyUniswapV3FeesParams memory params
    ) external {
        DataTypes.ReserveData storage reserve = reservesData[params.asset];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        INToken nToken = INToken(reserveCache.xTokenAddress);
        require(
            nToken.getXTokenType() == XTokenType.NTokenUniswapV3,
            Errors.ONLY_UNIV3_ALLOWED
        );

        address positionOwner = nToken.ownerOf(params.tokenId);
        address incentiveReceiver = address(0);

        if (msg.sender != positionOwner) {
            (, , , , , , , uint256 healthFactor, , ) = GenericLogic
                .calculateUserAccountData(
                    reservesData,
                    reservesList,
                    DataTypes.CalculateUserAccountDataParams({
                        userConfig: userConfig,
                        reservesCount: params.reservesCount,
                        user: positionOwner,
                        oracle: params.oracle
                    })
                );

            require(
                healthFactor < DataTypes.HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
                Errors.HEALTH_FACTOR_NOT_BELOW_THRESHOLD
            );
            incentiveReceiver = msg.sender;
        }

        INTokenUniswapV3(reserveCache.xTokenAddress).collectSupplyUniswapV3Fees(
                positionOwner,
                params.tokenId,
                incentiveReceiver
            );

        emit CollectSupplyUniswapV3Fees(params.tokenId);
    }
}
