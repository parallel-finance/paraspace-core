// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {INToken} from "../../../interfaces/INToken.sol";
import {IVesselClaim} from "../../../interfaces/IVesselClaim.sol";
import {IPoolAddressesProvider} from "../../../interfaces/IPoolAddressesProvider.sol";
import {DataTypes} from "../types/DataTypes.sol";
import {IPToken} from "../../../interfaces/IPToken.sol";
import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../../dependencies/openzeppelin/contracts/IERC721.sol";

import {Errors} from "../helpers/Errors.sol";
import {ValidationLogic} from "./ValidationLogic.sol";
import {SupplyLogic} from "./SupplyLogic.sol";
import {BorrowLogic} from "./BorrowLogic.sol";
import {ReserveLogic} from "./ReserveLogic.sol";
import {ReserveConfiguration} from "../configuration/ReserveConfiguration.sol";
import {UserConfiguration} from "../configuration/UserConfiguration.sol";
import {Address} from "../../../dependencies/openzeppelin/contracts/Address.sol";
import {ILendPoolLoan} from "../../../dependencies/benddao/contracts/interfaces/ILendPoolLoan.sol";
import {ILendPool} from "../../../dependencies/benddao/contracts/interfaces/ILendPool.sol";
import {BDaoDataTypes} from "../../../dependencies/benddao/contracts/libraries/types/BDaoDataTypes.sol";

/**
 * @title PositionMoverLogic library
 *
 * @notice Implements the base logic for moving positions
 */
library PositionMoverLogic {
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using ReserveLogic for DataTypes.ReserveData;
    using UserConfiguration for DataTypes.UserConfigurationMap;

    struct PositionMoverVars {
        address weth;
        address xTokenAddress;
        address nftAsset;
        uint256 tokenId;
        uint256 borrowAmount;
    }

    event PositionMoved(address asset, uint256 tokenId, address user);
    event ReserveUsedAsCollateralDisabled(
        address indexed reserve,
        address indexed user
    );

    function executeMovePositionFromBendDAO(
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider,
        ILendPoolLoan lendPoolLoan,
        ILendPool lendPool,
        uint256[] calldata loandIds
    ) external {
        PositionMoverVars memory tmpVar;

        tmpVar.weth = poolAddressProvider.getWETH();
        DataTypes.ReserveData storage reserve = ps._reserves[tmpVar.weth];
        tmpVar.xTokenAddress = reserve.xTokenAddress;
        ValidationLogic.validateFlashloanSimple(reserve);

        for (uint256 index = 0; index < loandIds.length; index++) {
            (
                tmpVar.nftAsset,
                tmpVar.tokenId,
                tmpVar.borrowAmount
            ) = _repayBendDAOPositionLoan(
                lendPoolLoan,
                lendPool,
                tmpVar.weth,
                tmpVar.xTokenAddress,
                loandIds[index]
            );

            supplyNFTandBorrowWETH(ps, poolAddressProvider, tmpVar);

            emit PositionMoved(tmpVar.nftAsset, tmpVar.tokenId, msg.sender);
        }
    }

    function _repayBendDAOPositionLoan(
        ILendPoolLoan lendPoolLoan,
        ILendPool lendPool,
        address weth,
        address xTokenAddress,
        uint256 loanId
    )
        internal
        returns (
            address nftAsset,
            uint256 tokenId,
            uint256 borrowAmount
        )
    {
        BDaoDataTypes.LoanData memory loanData = lendPoolLoan.getLoan(loanId);

        require(
            loanData.state == BDaoDataTypes.LoanState.Active,
            "Loan not active"
        );
        require(loanData.borrower == msg.sender, Errors.NOT_THE_OWNER);

        (, borrowAmount) = lendPoolLoan.getLoanReserveBorrowAmount(loanId);

        DataTypes.TimeLockParams memory timeLockParams;

        IPToken(xTokenAddress).transferUnderlyingTo(
            address(this),
            borrowAmount,
            timeLockParams
        );
        IERC20(weth).approve(address(lendPool), borrowAmount);

        lendPool.repay(loanData.nftAsset, loanData.nftTokenId, borrowAmount);

        (nftAsset, tokenId) = (loanData.nftAsset, loanData.nftTokenId);
    }

    function supplyNFTandBorrowWETH(
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider,
        PositionMoverVars memory tmpVar
    ) internal {
        DataTypes.ERC721SupplyParams[]
            memory tokenData = new DataTypes.ERC721SupplyParams[](1);
        tokenData[0] = DataTypes.ERC721SupplyParams({
            tokenId: tmpVar.tokenId,
            useAsCollateral: true
        });

        SupplyLogic.executeSupplyERC721(
            ps._reserves,
            ps._usersConfig[msg.sender],
            DataTypes.ExecuteSupplyERC721Params({
                asset: tmpVar.nftAsset,
                tokenData: tokenData,
                onBehalfOf: msg.sender,
                payer: msg.sender,
                referralCode: 0x0
            })
        );

        BorrowLogic.executeBorrow(
            ps._reserves,
            ps._reservesList,
            ps._usersConfig[msg.sender],
            DataTypes.ExecuteBorrowParams({
                asset: tmpVar.weth,
                user: msg.sender,
                onBehalfOf: msg.sender,
                amount: tmpVar.borrowAmount,
                referralCode: 0x0,
                releaseUnderlying: false,
                reservesCount: ps._reservesCount,
                oracle: poolAddressProvider.getPriceOracle(),
                priceOracleSentinel: poolAddressProvider.getPriceOracleSentinel()
            })
        );
    }

    function executeClaimOtherdeedAndSupply(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.OtherdeedClaimParams memory params
    ) external returns (uint256) {
        DataTypes.ReserveData storage reserve = reservesData[params.otherdeed];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();

        ValidationLogic.validateWithdrawERC721(
            reservesData,
            reserveCache,
            params.otherdeed,
            params.otherdeedIds
        );

        DataTypes.TimeLockParams memory timeLockParams;

        (
            uint64 oldCollateralizedBalance,
            uint64 newCollateralizedBalance
        ) = INToken(reserveCache.xTokenAddress).burn(
                msg.sender,
                address(this),
                params.otherdeedIds,
                timeLockParams
            );

        bool isWithdrawCollateral = (newCollateralizedBalance <
            oldCollateralizedBalance);

        if (isWithdrawCollateral) {
            if (newCollateralizedBalance == 0) {
                userConfig.setUsingAsCollateral(reserve.id, false);
                emit ReserveUsedAsCollateralDisabled(
                    params.otherdeed,
                    msg.sender
                );
            }
        }

        IERC721(params.otherdeed).setApprovalForAll(params.vessel, true);

        if (params.kodaIds.length == 0) {
            IVesselClaim(params.vessel).claimVessels(params.otherdeedIds);
        } else {
            IVesselClaim(params.vessel).claimVesselsAndKodas(
                params.otherdeedIds,
                params.kodaIds,
                params.kodaOtherdeedIds,
                params.merkleProofs
            );
        }

        IERC721(params.otherdeed).setApprovalForAll(params.vessel, false);

        SupplyLogic.executeSupplyERC721(
            reservesData,
            userConfig,
            DataTypes.ExecuteSupplyERC721Params({
                asset: params.otherdeedExpanded,
                tokenData: _getTokenData(params.otherdeedIds),
                onBehalfOf: msg.sender,
                payer: address(this),
                referralCode: 0x0
            })
        );

        SupplyLogic.executeSupplyERC721(
            reservesData,
            userConfig,
            DataTypes.ExecuteSupplyERC721Params({
                asset: params.vessel,
                tokenData: _getTokenData(params.otherdeedIds),
                onBehalfOf: msg.sender,
                payer: address(this),
                referralCode: 0x0
            })
        );

        if (params.kodaIds.length != 0) {
            SupplyLogic.executeSupplyERC721(
                reservesData,
                userConfig,
                DataTypes.ExecuteSupplyERC721Params({
                    asset: params.koda,
                    tokenData: _getTokenData(params.kodaIds),
                    onBehalfOf: msg.sender,
                    payer: address(this),
                    referralCode: 0x0
                })
            );
        }

        if (isWithdrawCollateral) {
            if (userConfig.isBorrowingAny()) {
                ValidationLogic.validateHFAndLtvERC721(
                    reservesData,
                    reservesList,
                    userConfig,
                    params.otherdeed,
                    params.otherdeedIds,
                    msg.sender,
                    params.reservesCount,
                    params.oracle
                );
            }
        }
    }

    function _getTokenData(uint256[] memory tokenIds)
        internal
        returns (DataTypes.ERC721SupplyParams[] memory tokenData)
    {
        tokenData = new DataTypes.ERC721SupplyParams[](tokenIds.length);
        for (uint256 index = 0; index < tokenIds.length; index++) {
            tokenData[index] = DataTypes.ERC721SupplyParams({
                tokenId: tokenIds[index],
                useAsCollateral: true
            });
        }
    }
}
