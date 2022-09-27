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
import {IPool} from "../../interfaces/IPool.sol";
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
 *   # Supply
 *   # Withdraw
 *   # Borrow
 *   # Repay
 *   # Liquidate positions
 * @dev To be covered by a proxy contract, owned by the PoolAddressesProvider of the specific market
 * @dev All admin functions are callable by the PoolConfigurator contract defined also in the
 *   PoolAddressesProvider
 **/
contract Pool is ReentrancyGuard, VersionedInitializable, PoolStorage, IPool {
    using ReserveLogic for DataTypes.ReserveData;

    uint256 public constant POOL_REVISION = 1;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;

    /**
     * @dev Only pool configurator can call functions marked by this modifier.
     **/
    modifier onlyPoolConfigurator() {
        _onlyPoolConfigurator();
        _;
    }

    /**
     * @dev Only pool admin can call functions marked by this modifier.
     **/
    modifier onlyPoolAdmin() {
        _onlyPoolAdmin();
        _;
    }

    function _onlyPoolConfigurator() internal view virtual {
        require(
            ADDRESSES_PROVIDER.getPoolConfigurator() == msg.sender,
            Errors.CALLER_NOT_POOL_CONFIGURATOR
        );
    }

    function _onlyPoolAdmin() internal view virtual {
        require(
            IACLManager(ADDRESSES_PROVIDER.getACLManager()).isPoolAdmin(
                msg.sender
            ),
            Errors.CALLER_NOT_POOL_ADMIN
        );
    }

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

    /// @inheritdoc IPool
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

    /// @inheritdoc IPool
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
                actualSpender: address(0),
                referralCode: referralCode
            })
        );
    }

    /// @inheritdoc IPool
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

    /// @inheritdoc IPool
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

    /// @inheritdoc IPool
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

    /// @inheritdoc IPool
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

    /// @inheritdoc IPool
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

    /// @inheritdoc IPool
    function repay(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        address onBehalfOf,
        bool usePTokens
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
                    usePTokens: usePTokens
                })
            );
    }

    /// @inheritdoc IPool
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

    /// @inheritdoc IPool
    function buyWithCredit(
        bytes32 marketplaceId,
        bytes calldata payload,
        DataTypes.Credit calldata credit,
        address onBehalfOf,
        uint16 referralCode
    ) external payable virtual override nonReentrant {
        address WETH = IPoolAddressesProvider(ADDRESSES_PROVIDER).getWETH();
        DataTypes.Marketplace memory marketplace = ADDRESSES_PROVIDER
            .getMarketplace(marketplaceId);
        DataTypes.OrderInfo memory orderInfo = IMarketplace(marketplace.adapter)
            .getAskOrderInfo(payload, WETH);
        orderInfo.taker = onBehalfOf;
        MarketplaceLogic.executeBuyWithCredit(
            _reserves,
            _reservesList,
            _usersConfig[onBehalfOf],
            DataTypes.ExecuteMarketplaceParams({
                marketplaceId: marketplaceId,
                payload: payload,
                credit: credit,
                ethLeft: msg.value,
                marketplace: marketplace,
                orderInfo: orderInfo,
                WETH: WETH,
                referralCode: referralCode,
                maxStableRateBorrowSizePercent: _maxStableRateBorrowSizePercent,
                reservesCount: _reservesCount,
                oracle: ADDRESSES_PROVIDER.getPriceOracle(),
                priceOracleSentinel: ADDRESSES_PROVIDER.getPriceOracleSentinel()
            })
        );
    }

    /// @inheritdoc IPool
    function batchBuyWithCredit(
        bytes32[] calldata marketplaceIds,
        bytes[] calldata payloads,
        DataTypes.Credit[] calldata credits,
        address onBehalfOf,
        uint16 referralCode
    ) external payable virtual override nonReentrant {
        address WETH = IPoolAddressesProvider(ADDRESSES_PROVIDER).getWETH();
        require(
            marketplaceIds.length == payloads.length &&
                payloads.length == credits.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        uint256 ethLeft = msg.value;
        for (uint256 i = 0; i < marketplaceIds.length; i++) {
            bytes32 marketplaceId = marketplaceIds[i];
            bytes memory payload = payloads[i];
            DataTypes.Credit memory credit = credits[i];

            DataTypes.Marketplace memory marketplace = ADDRESSES_PROVIDER
                .getMarketplace(marketplaceId);
            DataTypes.OrderInfo memory orderInfo = IMarketplace(
                marketplace.adapter
            ).getAskOrderInfo(payload, WETH);
            orderInfo.taker = onBehalfOf;

            ethLeft -= MarketplaceLogic.executeBuyWithCredit(
                _reserves,
                _reservesList,
                _usersConfig[onBehalfOf],
                DataTypes.ExecuteMarketplaceParams({
                    marketplaceId: marketplaceId,
                    payload: payload,
                    credit: credit,
                    ethLeft: ethLeft,
                    marketplace: marketplace,
                    orderInfo: orderInfo,
                    WETH: WETH,
                    referralCode: referralCode,
                    maxStableRateBorrowSizePercent: _maxStableRateBorrowSizePercent,
                    reservesCount: _reservesCount,
                    oracle: ADDRESSES_PROVIDER.getPriceOracle(),
                    priceOracleSentinel: ADDRESSES_PROVIDER
                        .getPriceOracleSentinel()
                })
            );
        }
    }

    /// @inheritdoc IPool
    function acceptBidWithCredit(
        bytes32 marketplaceId,
        bytes calldata payload,
        DataTypes.Credit calldata credit,
        address onBehalfOf,
        uint16 referralCode
    ) external virtual override nonReentrant {
        address WETH = IPoolAddressesProvider(ADDRESSES_PROVIDER).getWETH();
        DataTypes.Marketplace memory marketplace = ADDRESSES_PROVIDER
            .getMarketplace(marketplaceId);
        DataTypes.OrderInfo memory orderInfo = IMarketplace(marketplace.adapter)
            .getBidOrderInfo(payload);
        require(orderInfo.taker == onBehalfOf, Errors.INVALID_ORDER_TAKER);
        return
            MarketplaceLogic.executeAcceptBidWithCredit(
                _reserves,
                _reservesList,
                _usersConfig[orderInfo.maker],
                DataTypes.ExecuteMarketplaceParams({
                    marketplaceId: marketplaceId,
                    payload: payload,
                    credit: credit,
                    ethLeft: 0,
                    marketplace: marketplace,
                    orderInfo: orderInfo,
                    WETH: WETH,
                    referralCode: referralCode,
                    maxStableRateBorrowSizePercent: _maxStableRateBorrowSizePercent,
                    reservesCount: _reservesCount,
                    oracle: ADDRESSES_PROVIDER.getPriceOracle(),
                    priceOracleSentinel: ADDRESSES_PROVIDER
                        .getPriceOracleSentinel()
                })
            );
    }

    /// @inheritdoc IPool
    function batchAcceptBidWithCredit(
        bytes32[] calldata marketplaceIds,
        bytes[] calldata payloads,
        DataTypes.Credit[] calldata credits,
        address onBehalfOf,
        uint16 referralCode
    ) external virtual override nonReentrant {
        address WETH = IPoolAddressesProvider(ADDRESSES_PROVIDER).getWETH();
        require(
            marketplaceIds.length == payloads.length &&
                payloads.length == credits.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        for (uint256 i = 0; i < marketplaceIds.length; i++) {
            bytes32 marketplaceId = marketplaceIds[i];
            bytes memory payload = payloads[i];
            DataTypes.Credit memory credit = credits[i];

            DataTypes.Marketplace memory marketplace = ADDRESSES_PROVIDER
                .getMarketplace(marketplaceId);
            DataTypes.OrderInfo memory orderInfo = IMarketplace(
                marketplace.adapter
            ).getBidOrderInfo(payload);
            require(orderInfo.taker == onBehalfOf, Errors.INVALID_ORDER_TAKER);

            MarketplaceLogic.executeAcceptBidWithCredit(
                _reserves,
                _reservesList,
                _usersConfig[orderInfo.maker],
                DataTypes.ExecuteMarketplaceParams({
                    marketplaceId: marketplaceId,
                    payload: payload,
                    credit: credit,
                    ethLeft: 0,
                    marketplace: marketplace,
                    orderInfo: orderInfo,
                    WETH: WETH,
                    referralCode: referralCode,
                    maxStableRateBorrowSizePercent: _maxStableRateBorrowSizePercent,
                    reservesCount: _reservesCount,
                    oracle: ADDRESSES_PROVIDER.getPriceOracle(),
                    priceOracleSentinel: ADDRESSES_PROVIDER
                        .getPriceOracleSentinel()
                })
            );
        }
    }

    /// @inheritdoc IPool
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
        SupplyLogic.executeUseERC721AsCollateral(
            _reserves,
            _reservesList,
            _usersConfig[msg.sender],
            asset,
            tokenIds,
            useAsCollateral,
            _reservesCount,
            ADDRESSES_PROVIDER.getPriceOracle()
        );
    }

    /// @inheritdoc IPool
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

    /// @inheritdoc IPool
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

    /// @inheritdoc IPool
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
                collateralAsset: collateralAsset,
                collateralTokenId: collateralTokenId,
                user: user,
                priceOracle: ADDRESSES_PROVIDER.getPriceOracle()
            })
        );
    }

    /// @inheritdoc IPool
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
                collateralAsset: collateralAsset,
                collateralTokenId: collateralTokenId,
                user: user,
                priceOracle: ADDRESSES_PROVIDER.getPriceOracle()
            })
        );
    }

    /// @inheritdoc IPool
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

    /// @inheritdoc IPool
    function mintToTreasury(address[] calldata assets)
        external
        virtual
        override
        nonReentrant
    {
        PoolLogic.executeMintToTreasury(_reserves, assets);
    }

    /// @inheritdoc IPool
    function getReserveData(address asset)
        external
        view
        virtual
        override
        returns (DataTypes.ReserveData memory)
    {
        return _reserves[asset];
    }

    /// @inheritdoc IPool
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

    /// @inheritdoc IPool
    function getConfiguration(address asset)
        external
        view
        virtual
        override
        returns (DataTypes.ReserveConfigurationMap memory)
    {
        return _reserves[asset].configuration;
    }

    /// @inheritdoc IPool
    function getUserConfiguration(address user)
        external
        view
        virtual
        override
        returns (DataTypes.UserConfigurationMap memory)
    {
        return _usersConfig[user];
    }

    /// @inheritdoc IPool
    function getReserveNormalizedIncome(address asset)
        external
        view
        virtual
        override
        returns (uint256)
    {
        return _reserves[asset].getNormalizedIncome();
    }

    /// @inheritdoc IPool
    function getReserveNormalizedVariableDebt(address asset)
        external
        view
        virtual
        override
        returns (uint256)
    {
        return _reserves[asset].getNormalizedDebt();
    }

    /// @inheritdoc IPool
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

    /// @inheritdoc IPool
    function getReserveAddressById(uint16 id) external view returns (address) {
        return _reservesList[id];
    }

    /// @inheritdoc IPool
    function MAX_STABLE_RATE_BORROW_SIZE_PERCENT()
        external
        view
        virtual
        override
        returns (uint256)
    {
        return _maxStableRateBorrowSizePercent;
    }

    /// @inheritdoc IPool
    function MAX_NUMBER_RESERVES()
        public
        view
        virtual
        override
        returns (uint16)
    {
        return ReserveConfiguration.MAX_RESERVES_COUNT;
    }

    /// @inheritdoc IPool
    function finalizeTransfer(
        address asset,
        address from,
        address to,
        bool usedAsCollateral,
        uint256 value,
        uint256 balanceFromBefore,
        uint256 balanceToBefore
    ) external virtual override {
        require(
            msg.sender == _reserves[asset].xTokenAddress,
            Errors.CALLER_NOT_XTOKEN
        );
        SupplyLogic.executeFinalizeTransfer(
            _reserves,
            _reservesList,
            _usersConfig,
            DataTypes.FinalizeTransferParams({
                asset: asset,
                from: from,
                to: to,
                usedAsCollateral: usedAsCollateral,
                value: value,
                balanceFromBefore: balanceFromBefore,
                balanceToBefore: balanceToBefore,
                reservesCount: _reservesCount,
                oracle: ADDRESSES_PROVIDER.getPriceOracle()
            })
        );
    }

    /// @inheritdoc IPool
    function initReserve(
        address asset,
        DataTypes.AssetType assetType,
        address xTokenAddress,
        address stableDebtAddress,
        address variableDebtAddress,
        address interestRateStrategyAddress,
        address auctionStrategyAddress
    ) external virtual override onlyPoolConfigurator {
        if (
            PoolLogic.executeInitReserve(
                _reserves,
                _reservesList,
                DataTypes.InitReserveParams({
                    asset: asset,
                    assetType: assetType,
                    xTokenAddress: xTokenAddress,
                    stableDebtAddress: stableDebtAddress,
                    variableDebtAddress: variableDebtAddress,
                    interestRateStrategyAddress: interestRateStrategyAddress,
                    auctionStrategyAddress: auctionStrategyAddress,
                    reservesCount: _reservesCount,
                    maxNumberReserves: MAX_NUMBER_RESERVES()
                })
            )
        ) {
            _reservesCount++;
        }
    }

    /// @inheritdoc IPool
    function dropReserve(address asset)
        external
        virtual
        override
        onlyPoolConfigurator
    {
        PoolLogic.executeDropReserve(_reserves, _reservesList, asset);
    }

    /// @inheritdoc IPool
    function setReserveInterestRateStrategyAddress(
        address asset,
        address rateStrategyAddress
    ) external virtual override onlyPoolConfigurator {
        require(asset != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        require(
            _reserves[asset].id != 0 || _reservesList[0] == asset,
            Errors.ASSET_NOT_LISTED
        );
        _reserves[asset].interestRateStrategyAddress = rateStrategyAddress;
    }

    /// @inheritdoc IPool
    function setReserveAuctionStrategyAddress(
        address asset,
        address auctionStrategyAddress
    ) external virtual override onlyPoolConfigurator {
        require(asset != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        require(
            _reserves[asset].id != 0 || _reservesList[0] == asset,
            Errors.ASSET_NOT_LISTED
        );
        _reserves[asset].auctionStrategyAddress = auctionStrategyAddress;
    }

    /// @inheritdoc IPool
    function setReserveDynamicConfigsStrategyAddress(
        address asset,
        address dynamicConfigsStrategyAddress
    ) external virtual override onlyPoolConfigurator {
        require(asset != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        require(
            _reserves[asset].id != 0 || _reservesList[0] == asset,
            Errors.ASSET_NOT_LISTED
        );
        _reserves[asset]
            .dynamicConfigsStrategyAddress = dynamicConfigsStrategyAddress;
    }

    /// @inheritdoc IPool
    function setConfiguration(
        address asset,
        DataTypes.ReserveConfigurationMap calldata configuration
    ) external virtual override onlyPoolConfigurator {
        require(asset != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        require(
            _reserves[asset].id != 0 || _reservesList[0] == asset,
            Errors.ASSET_NOT_LISTED
        );
        _reserves[asset].configuration = configuration;
    }

    /// @inheritdoc IPool
    function setAuctionConfiguration(
        address asset,
        DataTypes.ReserveAuctionConfigurationMap calldata auctionConfiguration
    ) external virtual override onlyPoolConfigurator {
        require(asset != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        require(
            _reserves[asset].id != 0 || _reservesList[0] == asset,
            Errors.ASSET_NOT_LISTED
        );
        _reserves[asset].auctionConfiguration = auctionConfiguration;
    }

    /// @inheritdoc IPool
    function getAuctionConfiguration(address asset)
        external
        view
        virtual
        override
        returns (DataTypes.ReserveAuctionConfigurationMap memory)
    {
        return _reserves[asset].auctionConfiguration;
    }

    /// @inheritdoc IPool
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

    /// @inheritdoc IPool
    function rescueTokens(
        DataTypes.AssetType assetType,
        address token,
        address to,
        uint256 amountOrTokenId
    ) external virtual override onlyPoolAdmin {
        PoolLogic.executeRescueTokens(assetType, token, to, amountOrTokenId);
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

    /// @inheritdoc IPool
    function increaseUserTotalAtomicTokens(
        address asset,
        address user,
        uint24 changeBy
    ) external virtual override {
        require(
            msg.sender == _reserves[asset].xTokenAddress,
            Errors.CALLER_NOT_XTOKEN
        );
        uint24 newUserAtomicTokens = _usersConfig[user].userAtomicTokens +
            changeBy;

        require(newUserAtomicTokens <= _maxAtomicTokensAllowed);

        _usersConfig[user].userAtomicTokens = newUserAtomicTokens;
    }

    /// @inheritdoc IPool
    function decreaseUserTotalAtomicTokens(
        address asset,
        address user,
        uint24 changeBy
    ) external virtual override {
        require(
            msg.sender == _reserves[asset].xTokenAddress,
            Errors.CALLER_NOT_XTOKEN
        );

        _usersConfig[user].userAtomicTokens -= changeBy;
    }

    /// @inheritdoc IPool
    function setMaxAtomicTokensAllowed(uint24 value)
        external
        virtual
        override
        onlyPoolConfigurator
    {
        require(value != 0, Errors.INVALID_AMOUNT);

        _maxAtomicTokensAllowed = value;
    }
}
