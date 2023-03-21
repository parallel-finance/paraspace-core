// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {ParaVersionedInitializable} from "../libraries/paraspace-upgradeability/ParaVersionedInitializable.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC20WithPermit} from "../../interfaces/IERC20WithPermit.sol";
import {IERC20Detailed} from "../../dependencies/openzeppelin/contracts/IERC20Detailed.sol";
import {IERC1155} from "../../dependencies/openzeppelin/contracts/IERC1155.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {IPriceOracleGetter} from "../../interfaces/IPriceOracleGetter.sol";
import {IPoolInstantWithdraw} from "../../interfaces/IPoolInstantWithdraw.sol";
import {IInstantWithdrawNFT} from "../../interfaces/IInstantWithdrawNFT.sol";
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

/**
 * @title Pool Instant Withdraw contract
 *
 * @notice Main point of interaction with an ParaSpace protocol's market
 * @dev To be covered by a proxy contract, owned by the PoolAddressesProvider of the specific market
 * @dev All admin functions are callable by the PoolConfigurator contract defined also in the
 *   PoolAddressesProvider
 **/
contract PoolInstantWithdraw is
    ParaVersionedInitializable,
    ParaReentrancyGuard,
    PoolStorage,
    IPoolInstantWithdraw
{
    using ReserveLogic for DataTypes.ReserveData;
    using PercentageMath for uint256;
    using WadRayMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;
    using Counters for Counters.Counter;
    using SafeCast for uint256;
    using SafeERC20 for IERC20;

    IPoolAddressesProvider internal immutable ADDRESSES_PROVIDER;
    address internal immutable VAULT_CONTRACT;
    uint256 internal constant POOL_REVISION = 146;

    // See `IPoolCore` for descriptions
    event Borrow(
        address indexed reserve,
        address user,
        address indexed onBehalfOf,
        uint256 amount,
        DataTypes.InterestRateMode interestRateMode,
        uint256 borrowRate,
        uint16 indexed referralCode
    );
    event Repay(
        address indexed reserve,
        address indexed user,
        address indexed repayer,
        uint256 amount,
        bool usePTokens
    );

    /**
     * @dev Only asset listing or pool admin can call functions marked by this modifier.
     **/
    modifier onlyAssetListingOrPoolAdmins() {
        _onlyAssetListingOrPoolAdmins();
        _;
    }

    function _onlyAssetListingOrPoolAdmins() internal view {
        IACLManager aclManager = IACLManager(
            ADDRESSES_PROVIDER.getACLManager()
        );
        require(
            aclManager.isAssetListingAdmin(msg.sender) ||
                aclManager.isPoolAdmin(msg.sender),
            Errors.CALLER_NOT_ASSET_LISTING_OR_POOL_ADMIN
        );
    }

    /**
     * @dev Constructor.
     * @param provider The address of the PoolAddressesProvider contract
     */
    constructor(IPoolAddressesProvider provider, address vault) {
        ADDRESSES_PROVIDER = provider;
        VAULT_CONTRACT = vault;
    }

    function getRevision() internal pure virtual override returns (uint256) {
        return POOL_REVISION;
    }

    /// @inheritdoc IPoolInstantWithdraw
    function multicall(bytes[] calldata data)
        external
        virtual
        returns (bytes[] memory results)
    {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            results[i] = Address.functionDelegateCall(address(this), data[i]);
        }
        return results;
    }

    /// @inheritdoc IPoolInstantWithdraw
    function addBorrowableAssets(
        address collateralAsset,
        address[] calldata borrowableAssets
    ) external virtual override onlyAssetListingOrPoolAdmins {
        DataTypes.PoolStorage storage ps = poolStorage();
        EnumerableSet.AddressSet storage marketSets = ps
            ._collateralBorrowableAsset[collateralAsset];
        uint256 assetLength = borrowableAssets.length;
        for (uint256 i = 0; i < assetLength; i++) {
            address asset = borrowableAssets[i];
            if (!marketSets.contains(asset)) {
                marketSets.add(asset);
            }
        }
    }

    /// @inheritdoc IPoolInstantWithdraw
    function removeBorrowableAssets(
        address collateralAsset,
        address[] calldata borrowableAssets
    ) external virtual override onlyAssetListingOrPoolAdmins {
        DataTypes.PoolStorage storage ps = poolStorage();
        EnumerableSet.AddressSet storage marketSets = ps
            ._collateralBorrowableAsset[collateralAsset];
        uint256 assetLength = borrowableAssets.length;
        for (uint256 i = 0; i < assetLength; i++) {
            address asset = borrowableAssets[i];
            if (marketSets.contains(asset)) {
                marketSets.remove(asset);
            }
        }
    }

    /// @inheritdoc IPoolInstantWithdraw
    function setLoanCreationFeeRate(uint256 feeRate)
        external
        virtual
        override
        onlyAssetListingOrPoolAdmins
    {
        require(
            feeRate < PercentageMath.HALF_PERCENTAGE_FACTOR,
            "Value Too High"
        );
        DataTypes.PoolStorage storage ps = poolStorage();
        uint256 oldValue = ps._loanCreationFeeRate;
        if (oldValue != feeRate) {
            ps._loanCreationFeeRate = feeRate;
            emit LoanCreationFeeRateUpdated(oldValue, feeRate);
        }
    }

    function getLoanCreationFeeRate()
        external
        view
        virtual
        override
        returns (uint256)
    {
        DataTypes.PoolStorage storage ps = poolStorage();
        return ps._loanCreationFeeRate;
    }

    /// @inheritdoc IPoolInstantWithdraw
    function getBorrowableAssets(address collateralAsset)
        external
        view
        virtual
        override
        returns (address[] memory)
    {
        DataTypes.PoolStorage storage ps = poolStorage();
        EnumerableSet.AddressSet storage marketSets = ps
            ._collateralBorrowableAsset[collateralAsset];
        return marketSets.values();
    }

    /// @inheritdoc IPoolInstantWithdraw
    function getUserLoanIdList(address user)
        external
        view
        returns (uint256[] memory)
    {
        DataTypes.PoolStorage storage ps = poolStorage();
        return ps._userLoanIds[user];
    }

    /// @inheritdoc IPoolInstantWithdraw
    function getLoanInfo(uint256 loanId)
        external
        view
        returns (DataTypes.TermLoanData memory)
    {
        DataTypes.PoolStorage storage ps = poolStorage();
        return ps._termLoans[loanId];
    }

    /// @inheritdoc IPoolInstantWithdraw
    function getLoanCollateralPresentValue(uint256 loanId)
        external
        view
        returns (uint256)
    {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.TermLoanData storage loan = ps._termLoans[loanId];
        require(
            loan.state == DataTypes.LoanState.Active,
            Errors.INVALID_LOAN_STATE
        );

        uint256 presentValue = IInstantWithdrawNFT(loan.collateralAsset)
            .getPresentValueByDiscountRate(
                loan.collateralTokenId,
                loan.collateralAmount,
                loan.discountRate
            );

        return presentValue;
    }

    /// @inheritdoc IPoolInstantWithdraw
    function getLoanDebtValue(uint256 loanId) external view returns (uint256) {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.TermLoanData storage loan = ps._termLoans[loanId];
        require(
            loan.state == DataTypes.LoanState.Active,
            Errors.INVALID_LOAN_STATE
        );

        uint256 loanDebt = _calculateLoanStableDebt(
            loan.borrowAmount,
            loan.discountRate,
            loan.startTime
        );

        return loanDebt;
    }

    /// @inheritdoc IPoolInstantWithdraw
    function createLoan(
        address collateralAsset,
        uint256 collateralTokenId,
        uint256 collateralAmount,
        address borrowAsset,
        uint16 referralCode
    ) external nonReentrant returns (uint256) {
        DataTypes.PoolStorage storage ps = poolStorage();
        _validateBorrowAsset(ps, collateralAsset, borrowAsset);

        DataTypes.ReserveCache memory reserveCache;
        DataTypes.ReserveData storage reserve = ps._reserves[borrowAsset];
        reserveCache = reserve.cache();
        reserve.updateState(reserveCache);

        uint256 presentValue;
        uint256 discountRate;
        uint256 borrowAmount;
        // calculate amount can be borrowed
        {
            // fetch present value and discount rate from Oracle
            (presentValue, discountRate) = IInstantWithdrawNFT(collateralAsset)
                .getPresentValueAndDiscountRate(
                    collateralTokenId,
                    collateralAmount,
                    reserve.currentStableBorrowRate
                );

            uint256 presentValueInBorrowAsset = _calculatePresentValueInBorrowAsset(
                    borrowAsset,
                    presentValue
                );
            borrowAmount = presentValueInBorrowAsset.percentMul(
                PercentageMath.PERCENTAGE_FACTOR - ps._loanCreationFeeRate
            );
        }

        // validate borrow asset can be borrowed from lending pool
        ValidationLogic.validateInstantWithdrawBorrow(
            reserveCache,
            borrowAsset,
            borrowAmount
        );

        // handle asset
        {
            // transfer collateralAsset to reserveAddress
            IERC1155(collateralAsset).safeTransferFrom(
                msg.sender,
                VAULT_CONTRACT,
                collateralTokenId,
                collateralAmount,
                ""
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
                discountRate
            );
            IPToken(reserveCache.xTokenAddress).transferUnderlyingTo(
                msg.sender,
                borrowAmount
            );

            // update borrow asset interest rate
            reserve.updateInterestRates(reserveCache, borrowAsset, 0, 0);
        }

        // create Loan
        uint256 loanId = ps._loanIdCounter.current();
        ps._loanIdCounter.increment();
        ps._termLoans[loanId] = DataTypes.TermLoanData({
            loanId: loanId,
            state: DataTypes.LoanState.Active,
            startTime: uint40(block.timestamp),
            borrower: msg.sender,
            collateralAsset: collateralAsset,
            collateralTokenId: collateralTokenId.toUint64(),
            collateralAmount: collateralAmount.toUint64(),
            borrowAsset: borrowAsset,
            borrowAmount: borrowAmount,
            discountRate: discountRate
        });
        ps._userLoanIds[msg.sender].push(loanId);

        emit Borrow(
            borrowAsset,
            VAULT_CONTRACT,
            VAULT_CONTRACT,
            borrowAmount,
            DataTypes.InterestRateMode.STABLE,
            discountRate,
            referralCode
        );
        emit LoanCreated(
            msg.sender,
            loanId,
            collateralAsset,
            collateralTokenId,
            collateralAmount,
            borrowAsset,
            borrowAmount,
            discountRate
        );

        return borrowAmount;
    }

    /// @inheritdoc IPoolInstantWithdraw
    function swapLoanCollateral(uint256 loanId, address receiver)
        external
        override
        nonReentrant
    {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.TermLoanData storage loan = ps._termLoans[loanId];
        // check loan state
        require(
            loan.state == DataTypes.LoanState.Active,
            Errors.INVALID_LOAN_STATE
        );

        address collateralAsset = loan.collateralAsset;
        uint256 collateralTokenId = uint256(loan.collateralTokenId);
        uint256 collateralAmount = uint256(loan.collateralAmount);
        address borrowAsset = loan.borrowAsset;
        uint256 presentValueInBorrowAsset;
        // calculate amount for borrow asset with current present value
        {
            uint256 presentValue = IInstantWithdrawNFT(loan.collateralAsset)
                .getPresentValueByDiscountRate(
                    collateralTokenId,
                    collateralAmount,
                    loan.discountRate
                );
            presentValueInBorrowAsset = _calculatePresentValueInBorrowAsset(
                borrowAsset,
                presentValue
            );
        }

        // update borrow asset state
        DataTypes.ReserveCache memory reserveCache;
        DataTypes.ReserveData storage reserve = ps._reserves[borrowAsset];
        reserveCache = reserve.cache();
        reserve.updateState(reserveCache);

        // repay borrow asset debt and update interest rate
        uint256 loanDebt = _calculateLoanStableDebt(
            loan.borrowAmount,
            loan.discountRate,
            loan.startTime
        );
        require(
            presentValueInBorrowAsset >= loanDebt,
            Errors.INVALID_PRESENT_VALUE
        );
        _repayLoanDebt(reserveCache, borrowAsset, loanDebt, msg.sender);
        reserve.updateInterestRates(reserveCache, borrowAsset, 0, 0);

        // transfer to vault contract if got excess amount
        if (presentValueInBorrowAsset != loanDebt) {
            IERC20(borrowAsset).safeTransferFrom(
                msg.sender,
                VAULT_CONTRACT,
                presentValueInBorrowAsset - loanDebt
            );
        }

        // transfer collateral asset to receiver
        ILoanVault(VAULT_CONTRACT).transferCollateral(
            collateralAsset,
            collateralTokenId,
            collateralAmount,
            receiver
        );

        // update loan state
        loan.state = DataTypes.LoanState.Repaid;

        emit Repay(
            borrowAsset,
            VAULT_CONTRACT,
            VAULT_CONTRACT,
            loanDebt,
            false
        );
        emit LoanCollateralSwapped(
            msg.sender,
            loanId,
            borrowAsset,
            presentValueInBorrowAsset
        );
    }

    /// @inheritdoc IPoolInstantWithdraw
    function settleTermLoan(uint256 loanId) external override nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.TermLoanData storage loan = ps._termLoans[loanId];
        // check loan state
        require(
            loan.state == DataTypes.LoanState.Active,
            Errors.INVALID_LOAN_STATE
        );

        address collateralAsset = loan.collateralAsset;
        uint256 collateralTokenId = uint256(loan.collateralTokenId);
        uint256 collateralAmount = uint256(loan.collateralAmount);
        address borrowAsset = loan.borrowAsset;

        // update borrow asset state
        DataTypes.ReserveCache memory reserveCache;
        DataTypes.ReserveData storage reserve = ps._reserves[borrowAsset];
        reserveCache = reserve.cache();
        reserve.updateState(reserveCache);

        ILoanVault LoanVault = ILoanVault(VAULT_CONTRACT);
        LoanVault.settleCollateral(
            collateralAsset,
            collateralTokenId,
            collateralAmount
        );

        // repay borrow asset debt and update interest rate
        uint256 loanDebt = _calculateLoanStableDebt(
            loan.borrowAmount,
            loan.discountRate,
            loan.startTime
        );
        uint256 vaultBalance = IERC20(borrowAsset).balanceOf(VAULT_CONTRACT);
        if (loanDebt > vaultBalance) {
            LoanVault.swapETHToDerivativeAsset(
                borrowAsset,
                loanDebt - vaultBalance
            );
        }
        vaultBalance = IERC20(borrowAsset).balanceOf(VAULT_CONTRACT);
        // repay Math.min(totalDebt, vaultBalance) to prevent rebase token precision issue
        _repayLoanDebt(
            reserveCache,
            borrowAsset,
            Math.min(loanDebt, vaultBalance),
            VAULT_CONTRACT
        );
        reserve.updateInterestRates(reserveCache, borrowAsset, 0, 0);

        // update loan state
        loan.state = DataTypes.LoanState.Settled;

        emit Repay(
            borrowAsset,
            VAULT_CONTRACT,
            VAULT_CONTRACT,
            loanDebt,
            false
        );
        emit LoanSettled(loanId, msg.sender, borrowAsset, loanDebt);
    }

    function _validateBorrowAsset(
        DataTypes.PoolStorage storage ps,
        address collateralAsset,
        address borrowAsset
    ) internal view {
        EnumerableSet.AddressSet storage marketSets = ps
            ._collateralBorrowableAsset[collateralAsset];
        require(marketSets.contains(borrowAsset), Errors.INVALID_BORROW_ASSET);
    }

    function _calculatePresentValueInBorrowAsset(address asset, uint256 value)
        internal
        view
        returns (uint256)
    {
        address paraOracle = ADDRESSES_PROVIDER.getPriceOracle();
        uint256 assetPrice = IPriceOracleGetter(paraOracle).getAssetPrice(
            asset
        );
        uint256 assetDecimals = IERC20Detailed(asset).decimals();
        uint256 assetUnit = 10**assetDecimals;
        return (value * assetUnit) / assetPrice;
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
}
