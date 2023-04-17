// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {INToken} from "../../../interfaces/INToken.sol";
import {IPoolAddressesProvider} from "../../../interfaces/IPoolAddressesProvider.sol";
import {DataTypes} from "../types/DataTypes.sol";
import {IPToken} from "../../../interfaces/IPToken.sol";
import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";
import {Errors} from "../helpers/Errors.sol";
import {ValidationLogic} from "./ValidationLogic.sol";
import {SupplyLogic} from "./SupplyLogic.sol";
import {BorrowLogic} from "./BorrowLogic.sol";
import {ReserveLogic} from "./ReserveLogic.sol";
import {ReserveConfiguration} from "../configuration/ReserveConfiguration.sol";
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

    struct PositionMoverVars {
        address weth;
        address xTokenAddress;
        address nftAsset;
        uint256 tokenId;
        uint256 borrowAmount;
    }

    event PositionMoved(address asset, uint256 tokenId, address user);

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
}
