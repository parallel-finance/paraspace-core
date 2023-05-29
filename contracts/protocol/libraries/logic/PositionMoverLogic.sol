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
        address[] nftAssets;
        uint256[] tokenIds;
        uint256[] borrowAmounts;
        uint256 totalBorrowAmount;
    }

    event PositionMoved(address asset, uint256 tokenId, address user);

    function executeMovePositionFromBendDAO(
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider,
        ILendPoolLoan lendPoolLoan,
        ILendPool lendPool,
        uint256[] calldata loanIds
    ) external {
        address weth = poolAddressProvider.getWETH();
        DataTypes.ReserveData storage reserve = ps._reserves[weth];
        address xTokenAddress = reserve.xTokenAddress;

        uint256 borrowAmount = _repayBendDAOPositionLoanAndSupply(
            ps,
            lendPoolLoan,
            lendPool,
            weth,
            xTokenAddress,
            loanIds
        );

        borrowWETH(ps, poolAddressProvider, weth, borrowAmount);
    }

    function _repayBendDAOPositionLoanAndSupply(
        DataTypes.PoolStorage storage ps,
        ILendPoolLoan lendPoolLoan,
        ILendPool lendPool,
        address weth,
        address xTokenAddress,
        uint256[] calldata loanIds
    ) internal returns (uint256 borrowAmount) {
        BDaoDataTypes.LoanData memory loanData;
        PositionMoverVars memory tmpVar;

        tmpVar.borrowAmounts = new uint256[](loanIds.length);
        tmpVar.nftAssets = new address[](loanIds.length);
        tmpVar.tokenIds = new uint256[](loanIds.length);

        for (uint256 index = 0; index < loanIds.length; index++) {
            loanData = lendPoolLoan.getLoan(loanIds[index]);

            require(
                loanData.state == BDaoDataTypes.LoanState.Active,
                "Loan not active"
            );
            require(loanData.borrower == msg.sender, Errors.NOT_THE_OWNER);

            (, tmpVar.borrowAmounts[index]) = lendPoolLoan
                .getLoanReserveBorrowAmount(loanIds[index]);

            tmpVar.totalBorrowAmount += tmpVar.borrowAmounts[index];

            tmpVar.nftAssets[index] = loanData.nftAsset;
            tmpVar.tokenIds[index] = loanData.nftTokenId;
            emit PositionMoved(
                loanData.nftAsset,
                loanData.nftTokenId,
                msg.sender
            );
        }

        DataTypes.TimeLockParams memory timeLockParams;
        IPToken(xTokenAddress).transferUnderlyingTo(
            address(this),
            tmpVar.totalBorrowAmount,
            timeLockParams
        );
        IERC20(weth).approve(address(lendPool), tmpVar.totalBorrowAmount);

        lendPool.batchRepay(
            tmpVar.nftAssets,
            tmpVar.tokenIds,
            tmpVar.borrowAmounts
        );

        supplyAssets(ps, tmpVar);

        borrowAmount = tmpVar.totalBorrowAmount;
    }

    function supplyAssets(
        DataTypes.PoolStorage storage ps,
        PositionMoverVars memory tmpVar
    ) internal {
        DataTypes.ERC721SupplyParams[]
            memory tokensToSupply = new DataTypes.ERC721SupplyParams[](
                tmpVar.tokenIds.length
            );

        address currentSupplyAsset = tmpVar.nftAssets[0];
        uint256 supplySize = 1;
        tokensToSupply[0] = DataTypes.ERC721SupplyParams({
            tokenId: tmpVar.tokenIds[0],
            useAsCollateral: true
        });

        for (uint256 index = 0; index < tmpVar.tokenIds.length; index++) {
            if (
                index + 1 < tmpVar.tokenIds.length &&
                tmpVar.nftAssets[index] == tmpVar.nftAssets[index + 1]
            ) {
                tokensToSupply[supplySize] = DataTypes.ERC721SupplyParams({
                    tokenId: tmpVar.tokenIds[index + 1],
                    useAsCollateral: true
                });
                supplySize++;
            } else {
                reduceArrayAndSupply(
                    ps,
                    currentSupplyAsset,
                    tokensToSupply,
                    supplySize
                );

                if (index + 1 < tmpVar.tokenIds.length) {
                    currentSupplyAsset = tmpVar.nftAssets[index + 1];
                    tokensToSupply = tokensToSupply = new DataTypes.ERC721SupplyParams[](
                        tmpVar.tokenIds.length
                    );
                    tokensToSupply[0] = DataTypes.ERC721SupplyParams({
                        tokenId: tmpVar.tokenIds[index + 1],
                        useAsCollateral: true
                    });
                    supplySize = 1;
                }
            }
        }
    }

    function reduceArrayAndSupply(
        DataTypes.PoolStorage storage ps,
        address asset,
        DataTypes.ERC721SupplyParams[] memory tokensToSupply,
        uint256 subArraySize
    ) internal {
        subArraySize = tokensToSupply.length - subArraySize;
        if (subArraySize > 0 && tokensToSupply.length - subArraySize > 0) {
            assembly {
                mstore(tokensToSupply, sub(mload(tokensToSupply), subArraySize))
            }
        }

        // supply the current asset and tokens
        SupplyLogic.executeSupplyERC721(
            ps._reserves,
            ps._usersConfig[msg.sender],
            DataTypes.ExecuteSupplyERC721Params({
                asset: asset,
                tokenData: tokensToSupply,
                onBehalfOf: msg.sender,
                payer: msg.sender,
                referralCode: 0x0
            })
        );
    }

    function borrowWETH(
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider,
        address weth,
        uint256 borrowAmount
    ) internal {
        BorrowLogic.executeBorrow(
            ps._reserves,
            ps._reservesList,
            ps._usersConfig[msg.sender],
            DataTypes.ExecuteBorrowParams({
                asset: weth,
                user: msg.sender,
                onBehalfOf: msg.sender,
                amount: borrowAmount,
                referralCode: 0x0,
                releaseUnderlying: false,
                reservesCount: ps._reservesCount,
                oracle: poolAddressProvider.getPriceOracle(),
                priceOracleSentinel: poolAddressProvider.getPriceOracleSentinel()
            })
        );
    }
}
