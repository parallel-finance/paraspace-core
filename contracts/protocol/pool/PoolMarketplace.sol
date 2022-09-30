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
import {IPoolMarketplace} from "../../interfaces/IPoolMarketplace.sol";
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
 * @title Pool Marketplace contract
 *
 * @notice Main point of interaction with an ParaSpace protocol's market
 * - Users can:
 *   # buyWithCredit
 *   # acceptBidWithCredit
 *   # batchBuyWithCredit
 *   # batchAcceptBidWithCredit
 * @dev To be covered by a proxy contract, owned by the PoolAddressesProvider of the specific market
 * @dev All admin functions are callable by the PoolConfigurator contract defined also in the
 *   PoolAddressesProvider
 **/
contract PoolMarketplace is
    VersionedInitializable,
    ReentrancyGuard,
    PoolStorage,
    IPoolMarketplace
{
    using ReserveLogic for DataTypes.ReserveData;

    IPoolAddressesProvider internal immutable ADDRESSES_PROVIDER;
    uint256 internal constant POOL_REVISION = 1;

    /**
     * @dev Constructor.
     * @param provider The address of the PoolAddressesProvider contract
     */
    constructor(IPoolAddressesProvider provider) {
        ADDRESSES_PROVIDER = provider;
    }

    function getRevision() internal pure virtual override returns (uint256) {
        return POOL_REVISION;
    }

    /// @inheritdoc IPoolMarketplace
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
        MarketplaceLogic.refundETH();
    }

    /// @inheritdoc IPoolMarketplace
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
        MarketplaceLogic.refundETH();
    }

    /// @inheritdoc IPoolMarketplace
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

    /// @inheritdoc IPoolMarketplace
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
}
