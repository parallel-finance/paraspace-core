// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {ParaVersionedInitializable} from "../libraries/paraspace-upgradeability/ParaVersionedInitializable.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC20WithPermit} from "../../interfaces/IERC20WithPermit.sol";
import {IERC20Detailed} from "../../dependencies/openzeppelin/contracts/IERC20Detailed.sol";
import {IERC1155} from "../../dependencies/openzeppelin/contracts/IERC1155.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {IPriceOracleGetter} from "../../interfaces/IPriceOracleGetter.sol";
import {IPoolInstantWithdraw} from "../../interfaces/IPoolInstantWithdraw.sol";
import {IInstantWithdrawNFT} from "../../misc/interfaces/IInstantWithdrawNFT.sol";
import {ILoanParametersStrategy} from "../../interfaces/ILoanParametersStrategy.sol";
import {IFToken} from "../../interfaces/IFToken.sol";
import {IACLManager} from "../../interfaces/IACLManager.sol";
import {IReserveInterestRateStrategy} from "../../interfaces/IReserveInterestRateStrategy.sol";
import {IStableDebtToken} from "../../interfaces/IStableDebtToken.sol";
import {IPToken} from "../../interfaces/IPToken.sol";
import {ILoanVault} from "../../interfaces/ILoanVault.sol";
import {IWETH} from "../../misc/interfaces/IWETH.sol";
import {PoolStorage} from "./PoolStorage.sol";
import {ValidationLogic} from "../libraries/logic/ValidationLogic.sol";
import {ReserveLogic} from "../libraries/logic/ReserveLogic.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {Counters} from "../../dependencies/openzeppelin/contracts/Counters.sol";
import {ParaReentrancyGuard} from "../libraries/paraspace-upgradeability/ParaReentrancyGuard.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {EnumerableSet} from "../../dependencies/openzeppelin/contracts/EnumerableSet.sol";
import {PercentageMath} from "../libraries/math/PercentageMath.sol";
import {Math} from "../../dependencies/openzeppelin/contracts/Math.sol";
import {SafeCast} from "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {MathUtils} from "../libraries/math/MathUtils.sol";

contract PoolFixedTermLoans is
    ParaVersionedInitializable,
    ParaReentrancyGuard,
    PoolStorage
{
    IPoolAddressesProvider internal immutable ADDRESSES_PROVIDER;
    address internal immutable VAULT_CONTRACT;
    uint256 internal constant POOL_REVISION = 146;
    using ReserveLogic for DataTypes.ReserveData;
    using PercentageMath for uint256;
    using WadRayMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;
    using Counters for Counters.Counter;
    using SafeCast for uint256;
    using SafeERC20 for IERC20;

    event FixedTermLoanCreated(
        address indexed user,
        uint256 indexed loanId,
        address collateralAsset,
        uint256 collateralTokenId,
        uint256 collateralAmount,
        address borrowAsset,
        uint256 borrowAmount,
        uint256 discountRate
    );

    event Borrow(
        address indexed reserve,
        address user,
        address indexed onBehalfOf,
        uint256 amount,
        DataTypes.InterestRateMode interestRateMode,
        uint256 borrowRate,
        uint16 indexed referralCode
    );

    constructor(IPoolAddressesProvider provider, address vault) {
        ADDRESSES_PROVIDER = provider;
        VAULT_CONTRACT = vault;
    }

    function getLoanDebtValue(uint256 loanId) external view returns (uint256) {
        uint256 loanDebt;
        //  = _calculateLoanStableDebt(
        //     loan.borrowAmount,
        //     loan.interestRate,
        //     loan.startTime
        // );

        return loanDebt;
    }

    function fixedTermBorrow(
        address collateralAsset,
        uint256 collateralTokenId,
        uint256 collateralAmount,
        address borrowAsset,
        uint256 borrowAmount,
        uint256 maturityDate
    ) external nonReentrant returns (uint256) {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.FixedTermLoanStrategy storage fixedTermLoanStrategy = ps
            ._fixedTermLoanAssets[collateralAsset];

        _validateBorrowAssetIsBorrowable(fixedTermLoanStrategy, borrowAsset);

        DataTypes.ReserveCache memory reserveCache;
        DataTypes.ReserveData storage reserve = ps._reserves[borrowAsset];
        reserveCache = reserve.cache();
        reserve.updateState(reserveCache);

        DataTypes.FixedTermLoanParams memory loanParams = DataTypes
            .FixedTermLoanParams({
                collateralAsset: collateralAsset,
                assetType: fixedTermLoanStrategy.assetType,
                collateralTokenId: collateralTokenId,
                collateralAmount: collateralAmount,
                borrowAsset: borrowAsset,
                borrowAmount: borrowAmount,
                maturityDate: maturityDate,
                currentInterestRate: reserve.currentStableBorrowRate,
                loanId: 0,
                interestRate: 0
            });

        // calculate amount can be borrowed
        {
            (borrowAmount, loanParams.interestRate) = ILoanParametersStrategy(
                fixedTermLoanStrategy.loanParametersStrategyAddress
            ).calculateLoanParameters(loanParams);

            DataTypes.FixedTermLoanData memory loanData = DataTypes
                .FixedTermLoanData({
                    state: DataTypes.LoanState.Active,
                    startTime: uint40(block.timestamp),
                    borrower: msg.sender,
                    collateralAsset: collateralAsset,
                    collateralTokenId: collateralTokenId.toUint64(),
                    collateralAmount: collateralAmount.toUint64(),
                    borrowAsset: borrowAsset,
                    borrowAmount: uint128(borrowAmount),
                    interestRate: uint128(loanParams.interestRate),
                    maturityDate: uint40(maturityDate),
                    repaidAmount: 0
                });

            loanParams.loanId = IFToken(ps.fTokenAddress).mint(
                msg.sender,
                loanData
            );
        }

        // validate borrow asset can be borrowed from lending pool
        ValidationLogic.validateFixedTermBorrow(
            reserveCache,
            borrowAsset,
            borrowAmount
        );

        // handle asset
        {
            _transferCollateralToLoanManagement(
                loanParams,
                fixedTermLoanStrategy.loanManagementAddress
            );

            // mint debt token for reserveAddress and transfer borrow asset to borrower
            (
                ,
                reserveCache.nextTotalStableDebt,
                reserveCache.nextAvgStableBorrowRate
            ) = IStableDebtToken(reserveCache.stableDebtTokenAddress).mint(
                VAULT_CONTRACT,
                VAULT_CONTRACT,
                borrowAmount,
                loanParams.interestRate
            );
            DataTypes.TimeLockParams memory timeLockParams;
            IPToken(reserveCache.xTokenAddress).transferUnderlyingTo(
                msg.sender,
                borrowAmount,
                timeLockParams
            );

            // update borrow asset interest rate
            reserve.updateInterestRates(reserveCache, borrowAsset, 0, 0);
        }

        emit Borrow(
            borrowAsset,
            VAULT_CONTRACT,
            VAULT_CONTRACT,
            loanParams.borrowAmount,
            DataTypes.InterestRateMode.STABLE,
            loanParams.interestRate,
            0
        );
        emit FixedTermLoanCreated(
            msg.sender,
            loanParams.loanId,
            collateralAsset,
            collateralTokenId,
            collateralAmount,
            borrowAsset,
            loanParams.borrowAmount,
            loanParams.interestRate
        );

        return borrowAmount;
    }

    function fixedTermLoanRepay(uint256 tokenId, address receiver) external {
        // pretty much same as settle swapLoanCollateral
    }

    function fixedTermSettle() external {
        // same as settlement
    }

    // /// @inheritdoc IPoolInstantWithdraw
    // function swapLoanCollateral(uint256 loanId, address receiver)
    //     external
    //     override
    //     nonReentrant
    // {
    //     DataTypes.PoolStorage storage ps = poolStorage();
    //     DataTypes.TermLoanData storage loan = ps._termLoans[loanId];
    //     // check loan state
    //     require(
    //         loan.state == DataTypes.LoanState.Active,
    //         Errors.INVALID_LOAN_STATE
    //     );

    //     address collateralAsset = loan.collateralAsset;
    //     uint256 collateralTokenId = uint256(loan.collateralTokenId);
    //     uint256 collateralAmount = uint256(loan.collateralAmount);
    //     address borrowAsset = loan.borrowAsset;
    //     uint256 presentValueInBorrowAsset;
    //     // calculate amount for borrow asset with current present value
    //     {
    //         uint256 presentValue = IInstantWithdrawNFT(loan.collateralAsset)
    //             .getPresentValueByinterestRate(
    //                 collateralTokenId,
    //                 collateralAmount,
    //                 loan.interestRate
    //             );
    //         presentValueInBorrowAsset = _calculatePresentValueInBorrowAsset(
    //             borrowAsset,
    //             presentValue
    //         );
    //     }

    //     // update borrow asset state
    //     DataTypes.ReserveCache memory reserveCache;
    //     DataTypes.ReserveData storage reserve = ps._reserves[borrowAsset];
    //     reserveCache = reserve.cache();
    //     reserve.updateState(reserveCache);

    //     // repay borrow asset debt and update interest rate
    //     uint256 loanDebt = _calculateLoanStableDebt(
    //         loan.borrowAmount,
    //         loan.interestRate,
    //         loan.startTime
    //     );
    //     require(
    //         presentValueInBorrowAsset >= loanDebt,
    //         Errors.INVALID_PRESENT_VALUE
    //     );
    //     _repayLoanDebt(reserveCache, borrowAsset, loanDebt, msg.sender);
    //     reserve.updateInterestRates(reserveCache, borrowAsset, 0, 0);

    //     // transfer to vault contract if got excess amount
    //     if (presentValueInBorrowAsset != loanDebt) {
    //         IERC20(borrowAsset).safeTransferFrom(
    //             msg.sender,
    //             VAULT_CONTRACT,
    //             presentValueInBorrowAsset - loanDebt
    //         );
    //     }

    //     // transfer collateral asset to receiver
    //     ILoanVault(VAULT_CONTRACT).transferCollateral(
    //         collateralAsset,
    //         collateralTokenId,
    //         collateralAmount,
    //         receiver
    //     );

    //     // update loan state
    //     loan.state = DataTypes.LoanState.Repaid;

    //     emit Repay(
    //         borrowAsset,
    //         VAULT_CONTRACT,
    //         VAULT_CONTRACT,
    //         loanDebt,
    //         false
    //     );
    //     emit LoanCollateralSwapped(
    //         msg.sender,
    //         loanId,
    //         borrowAsset,
    //         presentValueInBorrowAsset
    //     );
    // }

    // /// @inheritdoc IPoolInstantWithdraw
    // function settleTermLoan(uint256 loanId) external override nonReentrant {
    //     DataTypes.PoolStorage storage ps = poolStorage();
    //     DataTypes.TermLoanData storage loan = ps._termLoans[loanId];
    //     // check loan state
    //     require(
    //         loan.state == DataTypes.LoanState.Active,
    //         Errors.INVALID_LOAN_STATE
    //     );

    //     address collateralAsset = loan.collateralAsset;
    //     uint256 collateralTokenId = uint256(loan.collateralTokenId);
    //     uint256 collateralAmount = uint256(loan.collateralAmount);
    //     address borrowAsset = loan.borrowAsset;

    //     // update borrow asset state
    //     DataTypes.ReserveCache memory reserveCache;
    //     DataTypes.ReserveData storage reserve = ps._reserves[borrowAsset];
    //     reserveCache = reserve.cache();
    //     reserve.updateState(reserveCache);

    //     ILoanVault LoanVault = ILoanVault(VAULT_CONTRACT);
    //     LoanVault.settleCollateral(
    //         collateralAsset,
    //         collateralTokenId,
    //         collateralAmount
    //     );

    //     // repay borrow asset debt and update interest rate
    //     uint256 loanDebt = _calculateLoanStableDebt(
    //         loan.borrowAmount,
    //         loan.interestRate,
    //         loan.startTime
    //     );
    //     uint256 vaultBalance = IERC20(borrowAsset).balanceOf(VAULT_CONTRACT);
    //     if (loanDebt > vaultBalance) {
    //         LoanVault.swapETHToDerivativeAsset(
    //             borrowAsset,
    //             loanDebt - vaultBalance
    //         );
    //     }
    //     vaultBalance = IERC20(borrowAsset).balanceOf(VAULT_CONTRACT);
    //     // repay Math.min(totalDebt, vaultBalance) to prevent rebase token precision issue
    //     _repayLoanDebt(
    //         reserveCache,
    //         borrowAsset,
    //         Math.min(loanDebt, vaultBalance),
    //         VAULT_CONTRACT
    //     );
    //     reserve.updateInterestRates(reserveCache, borrowAsset, 0, 0);

    //     // update loan state
    //     loan.state = DataTypes.LoanState.Settled;

    //     emit Repay(
    //         borrowAsset,
    //         VAULT_CONTRACT,
    //         VAULT_CONTRACT,
    //         loanDebt,
    //         false
    //     );
    //     emit LoanSettled(loanId, msg.sender, borrowAsset, loanDebt);
    // }

    function _validateBorrowAssetIsBorrowable(
        DataTypes.FixedTermLoanStrategy storage fixedTermLoanStrategy,
        address borrowAsset
    ) internal view {
        require(
            fixedTermLoanStrategy.borrowableAssets.contains(borrowAsset),
            Errors.INVALID_BORROW_ASSET
        );
    }

    function _calculateLoanStableDebt(
        uint256 principalStableDebt,
        uint256 stableRate,
        uint40 lastUpdateTime
    ) internal view returns (uint256) {
        uint256 compoundedInterest = MathUtils.calculateCompoundedInterest(
            stableRate,
            lastUpdateTime
        );

        return principalStableDebt.rayMul(compoundedInterest);
    }

    function _repayLoanDebt(
        DataTypes.ReserveCache memory reserveCache,
        address borrowAsset,
        uint256 repayAmount,
        address payer
    ) internal {
        (
            reserveCache.nextTotalStableDebt,
            reserveCache.nextAvgStableBorrowRate
        ) = IStableDebtToken(reserveCache.stableDebtTokenAddress).burn(
            VAULT_CONTRACT,
            repayAmount
        );
        IERC20(borrowAsset).safeTransferFrom(
            payer,
            reserveCache.xTokenAddress,
            repayAmount
        );
    }

    function _transferCollateralToLoanManagement(
        DataTypes.FixedTermLoanParams memory loanParams,
        address loanManagementAddress
    ) internal {
        if (loanParams.assetType == DataTypes.AssetType.ERC721) {
            IERC721(loanParams.collateralAsset).safeTransferFrom(
                msg.sender,
                loanManagementAddress,
                loanParams.collateralTokenId
            );
        } else if (loanParams.assetType == DataTypes.AssetType.ERC1155) {
            IERC1155(loanParams.collateralAsset).safeTransferFrom(
                msg.sender,
                loanManagementAddress,
                loanParams.collateralTokenId,
                loanParams.collateralAmount,
                ""
            );
        } else {
            IERC20(loanParams.collateralAsset).safeTransferFrom(
                msg.sender,
                loanManagementAddress,
                loanParams.collateralAmount
            );
        }
    }

    function getRevision() internal pure virtual override returns (uint256) {
        return POOL_REVISION;
    }
}
