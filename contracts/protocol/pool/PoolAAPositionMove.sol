// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {ParaVersionedInitializable} from "../libraries/paraspace-upgradeability/ParaVersionedInitializable.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {IPoolAAPositionMover} from "../../interfaces/IPoolAAPositionMover.sol";
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
    IAccountFactory internal immutable ACCOUNT_FACTORY;
    address internal immutable AA_MOVER;
    uint256 internal constant POOL_REVISION = 149;

    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using ReserveLogic for DataTypes.ReserveData;
    using SafeCast for uint256;

    event PositionMovedToAA(address indexed user, address aaAccount);

    constructor(IAccountFactory accountFactory, address aaMover) {
        ACCOUNT_FACTORY = accountFactory;
        AA_MOVER = aaMover;
    }

    function positionMoveToAA(
        address[] calldata users,
        uint256[] calldata salts
    ) external nonReentrant returns (address[] memory) {
        require(msg.sender == AA_MOVER, Errors.INVALID_CALLER);
        DataTypes.PoolStorage storage ps = poolStorage();

        return _executePositionMoveToAA(ps, ACCOUNT_FACTORY, users, salts);
    }

    function getRevision() internal pure virtual override returns (uint256) {
        return POOL_REVISION;
    }

    struct PositionMoveToAAVars {
        uint256 reservesCount;
        address[] xTokenAddresses;
        address[] debtTokenAddresses;
        DataTypes.ReserveConfigurationMap[] reserveConfigurations;
        uint256[] liquidityIndex;
        uint256[] debtIndex;
        address[] aaAccounts;
    }

    function _executePositionMoveToAA(
        DataTypes.PoolStorage storage ps,
        IAccountFactory accountFactory,
        address[] calldata users,
        uint256[] calldata salts
    ) internal returns (address[] memory) {
        require(users.length == salts.length, Errors.INVALID_PARAMETER);

        //construct vars
        PositionMoveToAAVars memory vars;
        vars.reservesCount = ps._reservesCount;
        vars.xTokenAddresses = new address[](vars.reservesCount);
        vars.debtTokenAddresses = new address[](vars.reservesCount);
        vars.reserveConfigurations = new DataTypes.ReserveConfigurationMap[](
            vars.reservesCount
        );
        vars.liquidityIndex = new uint256[](vars.reservesCount);
        vars.debtIndex = new uint256[](vars.reservesCount);
        vars.aaAccounts = new address[](users.length);

        for (uint256 index = 0; index < users.length; index++) {
            address user = users[index];

            //create AA account
            DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
                user
            ];
            address aaAccount = accountFactory.createAccount(
                user,
                salts[index]
            );
            DataTypes.UserConfigurationMap storage aaConfig = ps._usersConfig[
                aaAccount
            ];

            for (uint256 j = 0; j < vars.reservesCount; j++) {
                address currentReserveAddress = ps._reservesList[j];
                if (currentReserveAddress == address(0)) {
                    continue;
                }

                if (vars.xTokenAddresses[j] == address(0)) {
                    DataTypes.ReserveData storage currentReserve = ps._reserves[
                        currentReserveAddress
                    ];
                    vars.debtTokenAddresses[j] = currentReserve
                        .variableDebtTokenAddress;

                    DataTypes.ReserveCache memory reserveCache = currentReserve
                        .cache();
                    currentReserve.updateState(reserveCache);
                    vars.xTokenAddresses[j] = reserveCache.xTokenAddress;
                    vars.reserveConfigurations[j] = reserveCache
                        .reserveConfiguration;
                    vars.liquidityIndex[j] = reserveCache.nextLiquidityIndex;
                    vars.debtIndex[j] = reserveCache.nextVariableBorrowIndex;
                }

                if (
                    vars.reserveConfigurations[j].getAssetType() ==
                    DataTypes.AssetType.ERC20
                ) {
                    //handle ptoken
                    {
                        IPToken pToken = IPToken(vars.xTokenAddresses[j]);
                        uint256 balance = pToken.balanceOf(user);
                        if (balance > 0) {
                            DataTypes.TimeLockParams memory timeLockParams;
                            pToken.burn(
                                user,
                                vars.xTokenAddresses[j],
                                balance,
                                vars.liquidityIndex[j],
                                timeLockParams
                            );
                            pToken.mint(
                                aaAccount,
                                aaAccount,
                                balance,
                                vars.liquidityIndex[j]
                            );
                            if (userConfig.isUsingAsCollateral(j)) {
                                aaConfig.setUsingAsCollateral(j, true);
                                userConfig.setUsingAsCollateral(j, false);
                            }
                        }
                    }

                    //handle debt token
                    {
                        IVariableDebtToken debtToken = IVariableDebtToken(
                            vars.debtTokenAddresses[j]
                        );
                        uint256 balance = debtToken.balanceOf(user);
                        if (balance > 0) {
                            debtToken.burn(user, balance, vars.debtIndex[j]);
                            debtToken.mint(
                                aaAccount,
                                aaAccount,
                                balance,
                                vars.debtIndex[j]
                            );
                            aaConfig.setBorrowing(j, true);
                            userConfig.setBorrowing(j, false);
                        }
                    }
                } else {
                    INToken nToken = INToken(vars.xTokenAddresses[j]);
                    uint256 balance = nToken.balanceOf(user);
                    for (uint256 k = 0; k < balance; k++) {
                        uint256 tokenId = nToken.tokenOfOwnerByIndex(user, k);
                        bool isCollateral = nToken.isUsedAsCollateral(tokenId);
                        nToken.transferOnLiquidation(user, aaAccount, tokenId);
                        if (isCollateral) {
                            nToken.setIsUsedAsCollateral(
                                tokenId,
                                isCollateral,
                                aaAccount
                            );
                        }
                    }
                    if (balance > 0 && userConfig.isUsingAsCollateral(j)) {
                        aaConfig.setUsingAsCollateral(j, true);
                        userConfig.setUsingAsCollateral(j, false);
                    }
                }
            }

            vars.aaAccounts[index] = aaAccount;
            emit PositionMovedToAA(user, aaAccount);
        }

        return vars.aaAccounts;
    }
}
