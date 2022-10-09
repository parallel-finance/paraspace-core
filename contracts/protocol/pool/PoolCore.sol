// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {VersionedInitializable} from "../libraries/paraspace-upgradeability/VersionedInitializable.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {ReserveConfiguration} from "../libraries/configuration/ReserveConfiguration.sol";
import {PoolLogic} from "../libraries/logic/PoolLogic.sol";
import {ReserveLogic} from "../libraries/logic/ReserveLogic.sol";
import {SupplyLogic} from "../libraries/logic/SupplyLogic.sol";
import {MarketplaceLogic} from "../libraries/logic/MarketplaceLogic.sol";
import {BorrowLogic} from "../libraries/logic/BorrowLogic.sol";
import {LiquidationLogic} from "../libraries/logic/LiquidationLogic.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {IERC20WithPermit} from "../../interfaces/IERC20WithPermit.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {IPoolCore} from "../../interfaces/IPoolCore.sol";
import {INToken} from "../../interfaces/INToken.sol";
import {IACLManager} from "../../interfaces/IACLManager.sol";
import {PoolStorage} from "./PoolStorage.sol";
import {FlashClaimLogic} from "../libraries/logic/FlashClaimLogic.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {IERC721Receiver} from "../../dependencies/openzeppelin/contracts/IERC721Receiver.sol";
import {IMarketplace} from "../../interfaces/IMarketplace.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {ReentrancyGuard} from "../../dependencies/openzeppelin/contracts/ReentrancyGuard.sol";
import {IAuctionableERC721} from "../../interfaces/IAuctionableERC721.sol";
import {IReserveAuctionStrategy} from "../../interfaces/IReserveAuctionStrategy.sol";

/**
 * @title Pool contract
 *
 * @notice Main point of interaction with an ParaSpace protocol's market
 * - Users can:
 *   - Supply
 *   - Withdraw
 *   - Borrow
 *   - Repay
 *   - Liquidate positions
 * @dev To be covered by a proxy contract, owned by the PoolAddressesProvider of the specific market
 * @dev All admin functions are callable by the PoolConfigurator contract defined also in the
 *   PoolAddressesProvider
 **/
contract PoolCore is
    VersionedInitializable,
    ReentrancyGuard,
    PoolStorage,
    IPoolCore
{
    using ReserveLogic for DataTypes.ReserveData;

    uint256 public constant POOL_REVISION = 1;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;

    function getRevision() internal pure virtual override returns (uint256) {
        return POOL_REVISION;
    }

    /**
     * @dev Constructor.
     * @param provider The address of the PoolAddressesProvider contract
     */
    constructor(IPoolAddressesProvider provider) {
        ADDRESSES_PROVIDER = provider;
    }

    /**
     * @notice Initializes the Pool.
     * @dev Function is invoked by the proxy contract when the Pool contract is added to the
     * PoolAddressesProvider of the market.
     * @dev Caching the address of the PoolAddressesProvider in order to reduce gas consumption on subsequent operations
     * @param provider The address of the PoolAddressesProvider
     **/
    function initialize(IPoolAddressesProvider provider)
        external
        virtual
        initializer
    {
        require(
            provider == ADDRESSES_PROVIDER,
            Errors.INVALID_ADDRESSES_PROVIDER
        );
        _maxStableRateBorrowSizePercent = 0.25e4;
    }

    /// @inheritdoc IPoolCore
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external virtual override nonReentrant {
        SupplyLogic.executeSupply(
            _reserves,
            _usersConfig[onBehalfOf],
            DataTypes.ExecuteSupplyParams({
                asset: asset,
                amount: amount,
                onBehalfOf: onBehalfOf,
                referralCode: referralCode
            })
        );
    }

    /// @inheritdoc IPoolCore
    function supplyERC721(
        address asset,
        DataTypes.ERC721SupplyParams[] calldata tokenData,
        address onBehalfOf,
        uint16 referralCode
    ) external virtual override nonReentrant {
        SupplyLogic.executeSupplyERC721(
            _reserves,
            _usersConfig[onBehalfOf],
            DataTypes.ExecuteSupplyERC721Params({
                asset: asset,
                tokenData: tokenData,
                onBehalfOf: onBehalfOf,
                actualSpender: msg.sender,
                referralCode: referralCode
            })
        );
    }

    /// @inheritdoc IPoolCore
    function supplyERC721FromNToken(
        address asset,
        DataTypes.ERC721SupplyParams[] calldata tokenData,
        address onBehalfOf
    ) external virtual override nonReentrant {
        SupplyLogic.executeSupplyERC721FromNToken(
            _reserves,
            _usersConfig[onBehalfOf],
            DataTypes.ExecuteSupplyERC721Params({
                asset: asset,
                tokenData: tokenData,
                onBehalfOf: onBehalfOf,
                actualSpender: address(0),
                referralCode: 0
            })
        );
    }

    /// @inheritdoc IPoolCore
    function supplyWithPermit(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode,
        uint256 deadline,
        uint8 permitV,
        bytes32 permitR,
        bytes32 permitS
    ) external virtual override nonReentrant {
        // Need to accommodate ERC721 and ERC1155 here
        IERC20WithPermit(asset).permit(
            msg.sender,
            address(this),
            amount,
            deadline,
            permitV,
            permitR,
            permitS
        );
        SupplyLogic.executeSupply(
            _reserves,
            _usersConfig[onBehalfOf],
            DataTypes.ExecuteSupplyParams({
                asset: asset,
                amount: amount,
                onBehalfOf: onBehalfOf,
                referralCode: referralCode
            })
        );
    }

    /// @inheritdoc IPoolCore
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external virtual override nonReentrant returns (uint256) {
        return
            SupplyLogic.executeWithdraw(
                _reserves,
                _reservesList,
                _usersConfig[msg.sender],
                DataTypes.ExecuteWithdrawParams({
                    asset: asset,
                    amount: amount,
                    to: to,
                    reservesCount: _reservesCount,
                    oracle: ADDRESSES_PROVIDER.getPriceOracle()
                })
            );
    }

    /// @inheritdoc IPoolCore
    function withdrawERC721(
        address asset,
        uint256[] calldata tokenIds,
        address to
    ) external virtual override nonReentrant returns (uint256) {
        return
            SupplyLogic.executeWithdrawERC721(
                _reserves,
                _reservesList,
                _usersConfig[msg.sender],
                DataTypes.ExecuteWithdrawERC721Params({
                    asset: asset,
                    tokenIds: tokenIds,
                    to: to,
                    reservesCount: _reservesCount,
                    oracle: ADDRESSES_PROVIDER.getPriceOracle()
                })
            );
    }

    /// @inheritdoc IPoolCore
    function borrow(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        uint16 referralCode,
        address onBehalfOf
    ) external virtual override nonReentrant {
        BorrowLogic.executeBorrow(
            _reserves,
            _reservesList,
            _usersConfig[onBehalfOf],
            DataTypes.ExecuteBorrowParams({
                asset: asset,
                user: msg.sender,
                onBehalfOf: onBehalfOf,
                amount: amount,
                interestRateMode: DataTypes.InterestRateMode(interestRateMode),
                referralCode: referralCode,
                releaseUnderlying: true,
                maxStableRateBorrowSizePercent: _maxStableRateBorrowSizePercent,
                reservesCount: _reservesCount,
                oracle: ADDRESSES_PROVIDER.getPriceOracle(),
                priceOracleSentinel: ADDRESSES_PROVIDER.getPriceOracleSentinel()
            })
        );
    }

    /// @inheritdoc IPoolCore
    function repay(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        address onBehalfOf
    ) external virtual override nonReentrant returns (uint256) {
        return
            BorrowLogic.executeRepay(
                _reserves,
                _usersConfig[onBehalfOf],
                DataTypes.ExecuteRepayParams({
                    asset: asset,
                    amount: amount,
                    interestRateMode: DataTypes.InterestRateMode(
                        interestRateMode
                    ),
                    onBehalfOf: onBehalfOf,
                    usePTokens: false
                })
            );
    }

    /// @inheritdoc IPoolCore
    function repayWithPTokens(
        address asset,
        uint256 amount,
        uint256 interestRateMode
    ) external virtual override nonReentrant returns (uint256) {
        return
            BorrowLogic.executeRepay(
                _reserves,
                _usersConfig[msg.sender],
                DataTypes.ExecuteRepayParams({
                    asset: asset,
                    amount: amount,
                    interestRateMode: DataTypes.InterestRateMode(
                        interestRateMode
                    ),
                    onBehalfOf: msg.sender,
                    usePTokens: true
                })
            );
    }

    /// @inheritdoc IPoolCore
    function repayWithPermit(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        address onBehalfOf,
        uint256 deadline,
        uint8 permitV,
        bytes32 permitR,
        bytes32 permitS
    ) external virtual override nonReentrant returns (uint256) {
        {
            IERC20WithPermit(asset).permit(
                msg.sender,
                address(this),
                amount,
                deadline,
                permitV,
                permitR,
                permitS
            );
        }
        {
            DataTypes.ExecuteRepayParams memory params = DataTypes
                .ExecuteRepayParams({
                    asset: asset,
                    amount: amount,
                    interestRateMode: DataTypes.InterestRateMode(
                        interestRateMode
                    ),
                    onBehalfOf: onBehalfOf,
                    usePTokens: false
                });
            return
                BorrowLogic.executeRepay(
                    _reserves,
                    _usersConfig[onBehalfOf],
                    params
                );
        }
    }

    /// @inheritdoc IPoolCore
    function setUserUseERC20AsCollateral(address asset, bool useAsCollateral)
        external
        virtual
        override
        nonReentrant
    {
        SupplyLogic.executeUseERC20AsCollateral(
            _reserves,
            _reservesList,
            _usersConfig[msg.sender],
            asset,
            useAsCollateral,
            _reservesCount,
            ADDRESSES_PROVIDER.getPriceOracle()
        );
    }

    function setUserUseERC721AsCollateral(
        address asset,
        uint256[] calldata tokenIds,
        bool useAsCollateral
    ) external virtual override nonReentrant {
        if (useAsCollateral) {
            SupplyLogic.executeCollateralizeERC721(
                _reserves,
                _usersConfig[msg.sender],
                asset,
                tokenIds,
                msg.sender
            );
        } else {
            SupplyLogic.executeUncollateralizeERC721(
                _reserves,
                _reservesList,
                _usersConfig[msg.sender],
                asset,
                tokenIds,
                msg.sender,
                _reservesCount,
                ADDRESSES_PROVIDER.getPriceOracle()
            );
        }
    }

    /// @inheritdoc IPoolCore
    function liquidationCall(
        address collateralAsset,
        address debtAsset,
        address user,
        uint256 debtToCover,
        bool receivePToken
    ) external virtual override nonReentrant {
        LiquidationLogic.executeLiquidationCall(
            _reserves,
            _reservesList,
            _usersConfig,
            DataTypes.ExecuteLiquidationCallParams({
                reservesCount: _reservesCount,
                liquidationAmount: debtToCover,
                auctionRecoveryHealthFactor: _auctionRecoveryHealthFactor,
                collateralAsset: collateralAsset,
                liquidationAsset: debtAsset,
                user: user,
                receiveXToken: receivePToken,
                priceOracle: ADDRESSES_PROVIDER.getPriceOracle(),
                priceOracleSentinel: ADDRESSES_PROVIDER.getPriceOracleSentinel(),
                collateralTokenId: 0
            })
        );
    }

    /// @inheritdoc IPoolCore
    function liquidationERC721(
        address collateralAsset,
        address liquidationAsset,
        address user,
        uint256 collateralTokenId,
        uint256 liquidationAmount,
        bool receiveNToken
    ) external virtual override nonReentrant {
        LiquidationLogic.executeERC721LiquidationCall(
            _reserves,
            _reservesList,
            _usersConfig,
            DataTypes.ExecuteLiquidationCallParams({
                reservesCount: _reservesCount,
                liquidationAmount: liquidationAmount,
                auctionRecoveryHealthFactor: _auctionRecoveryHealthFactor,
                liquidationAsset: liquidationAsset,
                collateralAsset: collateralAsset,
                collateralTokenId: collateralTokenId,
                user: user,
                receiveXToken: receiveNToken,
                priceOracle: ADDRESSES_PROVIDER.getPriceOracle(),
                priceOracleSentinel: ADDRESSES_PROVIDER.getPriceOracleSentinel()
            })
        );
    }

    /// @inheritdoc IPoolCore
    function startAuction(
        address user,
        address collateralAsset,
        uint256 collateralTokenId
    ) external override nonReentrant {
        LiquidationLogic.executeStartAuction(
            _reserves,
            _reservesList,
            _usersConfig,
            DataTypes.ExecuteAuctionParams({
                reservesCount: _reservesCount,
                auctionRecoveryHealthFactor: _auctionRecoveryHealthFactor,
                collateralAsset: collateralAsset,
                collateralTokenId: collateralTokenId,
                user: user,
                priceOracle: ADDRESSES_PROVIDER.getPriceOracle()
            })
        );
    }

    /// @inheritdoc IPoolCore
    function endAuction(
        address user,
        address collateralAsset,
        uint256 collateralTokenId
    ) external override nonReentrant {
        LiquidationLogic.executeEndAuction(
            _reserves,
            _reservesList,
            _usersConfig,
            DataTypes.ExecuteAuctionParams({
                reservesCount: _reservesCount,
                auctionRecoveryHealthFactor: _auctionRecoveryHealthFactor,
                collateralAsset: collateralAsset,
                collateralTokenId: collateralTokenId,
                user: user,
                priceOracle: ADDRESSES_PROVIDER.getPriceOracle()
            })
        );
    }

    /// @inheritdoc IPoolCore
    function setAuctionValidityTime(address user)
        external
        virtual
        override
        nonReentrant
    {
        require(user != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        DataTypes.UserConfigurationMap storage userConfig = _usersConfig[user];
        (, , , , , , uint256 erc721HealthFactor) = PoolLogic
            .executeGetUserAccountData(
                _reserves,
                _reservesList,
                DataTypes.CalculateUserAccountDataParams({
                    userConfig: userConfig,
                    reservesCount: _reservesCount,
                    user: user,
                    oracle: ADDRESSES_PROVIDER.getPriceOracle()
                })
            );
        require(
            erc721HealthFactor > _auctionRecoveryHealthFactor,
            Errors.ERC721_HEALTH_FACTOR_NOT_ABOVE_THRESHOLD
        );
        userConfig.auctionValidityTime = block.timestamp;
    }

    /// @inheritdoc IPoolCore
    function flashClaim(
        address receiverAddress,
        address nftAsset,
        uint256[] calldata nftTokenIds,
        bytes calldata params
    ) external virtual override nonReentrant {
        FlashClaimLogic.executeFlashClaim(
            _reserves,
            DataTypes.ExecuteFlashClaimParams({
                receiverAddress: receiverAddress,
                nftAsset: nftAsset,
                nftTokenIds: nftTokenIds,
                params: params
            })
        );
    }

    /// @inheritdoc IPoolCore
    function getReserveData(address asset)
        external
        view
        virtual
        override
        returns (DataTypes.ReserveData memory)
    {
        return _reserves[asset];
    }

    /// @inheritdoc IPoolCore
    function getUserAccountData(address user)
        external
        view
        virtual
        override
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor,
            uint256 erc721HealthFactor
        )
    {
        return
            PoolLogic.executeGetUserAccountData(
                _reserves,
                _reservesList,
                DataTypes.CalculateUserAccountDataParams({
                    userConfig: _usersConfig[user],
                    reservesCount: _reservesCount,
                    user: user,
                    oracle: ADDRESSES_PROVIDER.getPriceOracle()
                })
            );
    }

    /// @inheritdoc IPoolCore
    function getConfiguration(address asset)
        external
        view
        virtual
        override
        returns (DataTypes.ReserveConfigurationMap memory)
    {
        return _reserves[asset].configuration;
    }

    /// @inheritdoc IPoolCore
    function getUserConfiguration(address user)
        external
        view
        virtual
        override
        returns (DataTypes.UserConfigurationMap memory)
    {
        return _usersConfig[user];
    }

    /// @inheritdoc IPoolCore
    function getReserveNormalizedIncome(address asset)
        external
        view
        virtual
        override
        returns (uint256)
    {
        return _reserves[asset].getNormalizedIncome();
    }

    /// @inheritdoc IPoolCore
    function getReserveNormalizedVariableDebt(address asset)
        external
        view
        virtual
        override
        returns (uint256)
    {
        return _reserves[asset].getNormalizedDebt();
    }

    /// @inheritdoc IPoolCore
    function getReservesList()
        external
        view
        virtual
        override
        returns (address[] memory)
    {
        uint256 reservesListCount = _reservesCount;
        uint256 droppedReservesCount = 0;
        address[] memory reservesList = new address[](reservesListCount);

        for (uint256 i = 0; i < reservesListCount; i++) {
            if (_reservesList[i] != address(0)) {
                reservesList[i - droppedReservesCount] = _reservesList[i];
            } else {
                droppedReservesCount++;
            }
        }

        // Reduces the length of the reserves array by `droppedReservesCount`
        assembly {
            mstore(reservesList, sub(reservesListCount, droppedReservesCount))
        }
        return reservesList;
    }

    /// @inheritdoc IPoolCore
    function getReserveAddressById(uint16 id) external view returns (address) {
        return _reservesList[id];
    }

    /// @inheritdoc IPoolCore
    function MAX_STABLE_RATE_BORROW_SIZE_PERCENT()
        external
        view
        virtual
        override
        returns (uint256)
    {
        return _maxStableRateBorrowSizePercent;
    }

    /// @inheritdoc IPoolCore
    function MAX_NUMBER_RESERVES()
        external
        view
        virtual
        override
        returns (uint16)
    {
        return ReserveConfiguration.MAX_RESERVES_COUNT;
    }

    /// @inheritdoc IPoolCore
    function MAX_ATOMIC_TOKENS_ALLOWED()
        external
        view
        virtual
        override
        returns (uint24)
    {
        return _maxAtomicTokensAllowed;
    }

    /// @inheritdoc IPoolCore
    function AUCTION_RECOVERY_HEALTH_FACTOR()
        external
        view
        virtual
        override
        returns (uint64)
    {
        return _auctionRecoveryHealthFactor;
    }

    /// @inheritdoc IPoolCore
    function finalizeTransfer(
        address asset,
        address from,
        address to,
        bool usedAsCollateral,
        uint256 amount,
        uint256 balanceFromBefore,
        uint256 balanceToBefore
    ) external virtual override {
        require(
            msg.sender == _reserves[asset].xTokenAddress,
            Errors.CALLER_NOT_XTOKEN
        );
        SupplyLogic.executeFinalizeTransferERC20(
            _reserves,
            _reservesList,
            _usersConfig,
            DataTypes.FinalizeTransferParams({
                asset: asset,
                from: from,
                to: to,
                usedAsCollateral: usedAsCollateral,
                amount: amount,
                balanceFromBefore: balanceFromBefore,
                balanceToBefore: balanceToBefore,
                reservesCount: _reservesCount,
                oracle: ADDRESSES_PROVIDER.getPriceOracle()
            })
        );
    }

    /// @inheritdoc IPoolCore
    function finalizeTransferERC721(
        address asset,
        address from,
        address to,
        bool usedAsCollateral,
        uint256 balanceFromBefore,
        uint256 balanceToBefore
    ) external virtual override {
        require(
            msg.sender == _reserves[asset].xTokenAddress,
            Errors.CALLER_NOT_XTOKEN
        );
        SupplyLogic.executeFinalizeTransferERC721(
            _reserves,
            _reservesList,
            _usersConfig,
            DataTypes.FinalizeTransferParams({
                asset: asset,
                from: from,
                to: to,
                usedAsCollateral: usedAsCollateral,
                amount: 1,
                balanceFromBefore: balanceFromBefore,
                balanceToBefore: balanceToBefore,
                reservesCount: _reservesCount,
                oracle: ADDRESSES_PROVIDER.getPriceOracle()
            })
        );
    }

    /// @inheritdoc IPoolCore
    function getAuctionData(address ntokenAsset, uint256 tokenId)
        external
        view
        virtual
        override
        returns (DataTypes.AuctionData memory auctionData)
    {
        address underlyingAsset = INToken(ntokenAsset)
            .UNDERLYING_ASSET_ADDRESS();
        DataTypes.ReserveData storage reserve = _reserves[underlyingAsset];
        require(
            reserve.id != 0 || _reservesList[0] == underlyingAsset,
            Errors.ASSET_NOT_LISTED
        );

        if (reserve.auctionStrategyAddress != address(0)) {
            uint256 startTime = IAuctionableERC721(ntokenAsset)
                .getAuctionData(tokenId)
                .startTime;
            IReserveAuctionStrategy auctionStrategy = IReserveAuctionStrategy(
                reserve.auctionStrategyAddress
            );

            auctionData.startTime = startTime;
            auctionData.asset = underlyingAsset;
            auctionData.tokenId = tokenId;
            auctionData.currentPriceMultiplier = auctionStrategy
                .calculateAuctionPriceMultiplier(startTime, block.timestamp);

            auctionData.maxPriceMultiplier = auctionStrategy
                .getMaxPriceMultiplier();
            auctionData.minExpPriceMultiplier = auctionStrategy
                .getMinExpPriceMultiplier();
            auctionData.minPriceMultiplier = auctionStrategy
                .getMinPriceMultiplier();
            auctionData.stepLinear = auctionStrategy.getStepLinear();
            auctionData.stepExp = auctionStrategy.getStepExp();
            auctionData.tickLength = auctionStrategy.getTickLength();
        }
    }

    // This function is necessary when receive erc721 from looksrare
    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external virtual returns (bytes4) {
        return this.onERC721Received.selector;
    }

    receive() external payable {
        require(
            msg.sender ==
                address(IPoolAddressesProvider(ADDRESSES_PROVIDER).getWETH()),
            "Receive not allowed"
        );
    }
}
