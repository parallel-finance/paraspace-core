// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {ParaVersionedInitializable} from "../libraries/paraspace-upgradeability/ParaVersionedInitializable.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {IPoolAAPositionMover} from "../../interfaces/IPoolAAPositionMover.sol";
import {IAccount} from "../../interfaces/IAccount.sol";
import {PoolStorage} from "./PoolStorage.sol";
import {ParaReentrancyGuard} from "../libraries/paraspace-upgradeability/ParaReentrancyGuard.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {INToken} from "../../interfaces/INToken.sol";
import {IPToken} from "../../interfaces/IPToken.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {ReserveConfiguration} from "../../protocol/libraries/configuration/ReserveConfiguration.sol";
import {UserConfiguration} from "../../protocol/libraries/configuration/UserConfiguration.sol";
import {ReserveLogic} from "../libraries/logic/ReserveLogic.sol";
import {SafeCast} from "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {IAccountFactory} from "../../interfaces/IAccountFactory.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {IVariableDebtToken} from "../../interfaces/IVariableDebtToken.sol";
import {MathUtils} from "../libraries/math/MathUtils.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";

/**
 * @title Pool PositionMover contract
 *
 **/
contract PoolAAPositionMover is
    ParaVersionedInitializable,
    ParaReentrancyGuard,
    PoolStorage,
    IPoolAAPositionMover
{
    uint256 internal constant POOL_REVISION = 200;

    event ReserveUsedAsCollateralEnabled(
        address indexed reserve,
        address indexed user
    );
    event ReserveUsedAsCollateralDisabled(
        address indexed reserve,
        address indexed user
    );

    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using ReserveLogic for DataTypes.ReserveData;
    using SafeCast for uint256;
    using WadRayMath for uint256;

    struct MigrationCacheVars {
        uint256 reservesCount;
        bool isTokenCollateral;
        bool isCollectionCollateral;
        DataTypes.TimeLockParams timeLockParams;
    }

    function positionMoveToAA(address aaAccount) external nonReentrant {
        require(
            IAccount(aaAccount).owner() == msg.sender,
            Errors.NOT_THE_OWNER
        );

        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
            msg.sender
        ];
        DataTypes.UserConfigurationMap storage aaConfig = ps._usersConfig[
            aaAccount
        ];

        MigrationCacheVars memory cacheVars;
        cacheVars.reservesCount = ps._reservesCount;
        for (uint256 j = 0; j < cacheVars.reservesCount; j++) {
            address currentReserveAddress = ps._reservesList[j];
            if (currentReserveAddress == address(0)) {
                continue;
            }

            DataTypes.ReserveCache memory reserveCache = ps
                ._reserves[currentReserveAddress]
                .cache();
            if (
                reserveCache.reserveConfiguration.getAssetType() ==
                DataTypes.AssetType.ERC20
            ) {
                //handle ptoken
                {
                    IPToken pToken = IPToken(reserveCache.xTokenAddress);
                    uint256 balance = pToken.balanceOf(msg.sender);
                    if (balance > 0) {
                        uint256 nextLiquidityIndex = _calculateLiquidityIndex(
                            reserveCache
                        );
                        pToken.burn(
                            msg.sender,
                            reserveCache.xTokenAddress,
                            balance,
                            nextLiquidityIndex,
                            cacheVars.timeLockParams
                        );
                        pToken.mint(
                            aaAccount,
                            aaAccount,
                            balance,
                            nextLiquidityIndex
                        );
                        if (userConfig.isUsingAsCollateral(j)) {
                            aaConfig.setUsingAsCollateral(j, true);
                            emit ReserveUsedAsCollateralEnabled(
                                currentReserveAddress,
                                aaAccount
                            );
                            userConfig.setUsingAsCollateral(j, false);
                            emit ReserveUsedAsCollateralDisabled(
                                currentReserveAddress,
                                msg.sender
                            );
                        }
                    }
                }

                //handle debt token
                {
                    IVariableDebtToken debtToken = IVariableDebtToken(
                        ps
                            ._reserves[currentReserveAddress]
                            .variableDebtTokenAddress
                    );
                    uint256 balance = debtToken.balanceOf(msg.sender);
                    if (balance > 0) {
                        uint256 debtIndex = _calculateDebtIndex(reserveCache);
                        debtToken.burn(msg.sender, balance, debtIndex);
                        debtToken.mint(
                            aaAccount,
                            aaAccount,
                            balance,
                            debtIndex
                        );
                        aaConfig.setBorrowing(j, true);
                        userConfig.setBorrowing(j, false);
                    }
                }
            } else {
                INToken nToken = INToken(reserveCache.xTokenAddress);
                uint256 balance = nToken.balanceOf(msg.sender);
                cacheVars.isCollectionCollateral = false;
                for (uint256 k = 0; k < balance; k++) {
                    uint256 tokenId = nToken.tokenOfOwnerByIndex(msg.sender, k);
                    cacheVars.isTokenCollateral = nToken.isUsedAsCollateral(
                        tokenId
                    );
                    nToken.transferOnLiquidation(
                        msg.sender,
                        aaAccount,
                        tokenId
                    );
                    if (cacheVars.isTokenCollateral) {
                        nToken.setIsUsedAsCollateral(tokenId, true, aaAccount);
                        cacheVars.isCollectionCollateral = true;
                    }
                }
                if (cacheVars.isCollectionCollateral) {
                    aaConfig.setUsingAsCollateral(j, true);
                    emit ReserveUsedAsCollateralEnabled(
                        currentReserveAddress,
                        aaAccount
                    );
                    userConfig.setUsingAsCollateral(j, false);
                    emit ReserveUsedAsCollateralDisabled(
                        currentReserveAddress,
                        msg.sender
                    );
                }
            }
        }

        emit PositionMovedToAA(msg.sender, aaAccount);
    }

    function getRevision() internal pure virtual override returns (uint256) {
        return POOL_REVISION;
    }

    function _calculateLiquidityIndex(
        DataTypes.ReserveCache memory reserveCache
    ) internal view returns (uint256) {
        uint256 cumulatedLiquidityInterest = MathUtils.calculateLinearInterest(
            reserveCache.currLiquidityRate,
            reserveCache.reserveLastUpdateTimestamp
        );
        return
            cumulatedLiquidityInterest.rayMul(reserveCache.currLiquidityIndex);
    }

    function _calculateDebtIndex(
        DataTypes.ReserveCache memory reserveCache
    ) internal view returns (uint256) {
        uint256 cumulatedVariableBorrowInterest = MathUtils
            .calculateCompoundedInterest(
                reserveCache.currVariableBorrowRate,
                reserveCache.reserveLastUpdateTimestamp
            );
        return
            cumulatedVariableBorrowInterest.rayMul(
                reserveCache.currVariableBorrowIndex
            );
    }
}
