// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {INToken} from "../../../interfaces/INToken.sol";
import {IPoolAddressesProvider} from "../../../interfaces/IPoolAddressesProvider.sol";
import {XTokenType} from "../../../interfaces/IXTokenType.sol";
import {DataTypes} from "../types/DataTypes.sol";
import {IPToken} from "../../../interfaces/IPToken.sol";
import {Errors} from "../helpers/Errors.sol";
import {ValidationLogic} from "./ValidationLogic.sol";
import {SupplyLogic} from "./SupplyLogic.sol";
import {BorrowLogic} from "./BorrowLogic.sol";
import {SafeERC20} from "../../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../../dependencies/openzeppelin/contracts/IERC721.sol";
import {ReserveLogic} from "./ReserveLogic.sol";
import {ConsiderationItem, OfferItem} from "../../../dependencies/seaport/contracts/lib/ConsiderationStructs.sol";
import {Math} from "../../../dependencies/openzeppelin/contracts/Math.sol";
import {PercentageMath} from "../../../protocol/libraries/math/PercentageMath.sol";
import {ItemType} from "../../../dependencies/seaport/contracts/lib/ConsiderationEnums.sol";
import {AdvancedOrder} from "../../../dependencies/seaport/contracts/lib/ConsiderationStructs.sol";
import {IWETH} from "../../../misc/interfaces/IWETH.sol";
import {UserConfiguration} from "../configuration/UserConfiguration.sol";
import {IMarketplace} from "../../../interfaces/IMarketplace.sol";
import {Address} from "../../../dependencies/openzeppelin/contracts/Address.sol";
import {ISwapAdapter} from "../../../interfaces/ISwapAdapter.sol";
import {Helpers} from "../../../protocol/libraries/helpers/Helpers.sol";
import {MathUtils} from "../math/MathUtils.sol";
import {WadRayMath} from "../../libraries/math/WadRayMath.sol";

/**
 * @title Marketplace library
 *
 * @notice Implements the base logic for all the actions related to NFT buy/accept bid
 */
library MarketplaceLogic {
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using ReserveLogic for DataTypes.ReserveData;
    using SafeERC20 for IERC20;
    using Math for uint256;
    using PercentageMath for uint256;
    using WadRayMath for uint256;

    event ReserveUsedAsCollateralEnabled(
        address indexed reserve,
        address indexed user
    );
    event Supply(
        address indexed reserve,
        address user,
        address indexed onBehalfOf,
        uint256 amount,
        uint16 indexed referralCode
    );

    event BuyWithCredit(
        bytes32 indexed marketplaceId,
        DataTypes.OrderInfo orderInfo,
        DataTypes.Credit credit
    );

    event AcceptBidWithCredit(
        bytes32 indexed marketplaceId,
        DataTypes.OrderInfo orderInfo,
        DataTypes.Credit credit
    );

    struct MarketplaceLocalVars {
        bool isListingTokenETH;
        bool isListingTokenPToken;
        bool isCollectionListed;
        address listingToken;
        address listingXTokenAddress;
        address creditToken;
        address creditXTokenAddress;
        address collectionToken;
        address collectionXTokenAddress;
        uint256 listingTokenNextLiquidityIndex;
        uint256 creditAmount;
        uint256 borrowAmount;
        uint256 supplyAmount;
        uint256 price;
    }

    function executeBuyWithCredit(
        DataTypes.PoolStorage storage ps,
        bytes32 marketplaceId,
        bytes calldata payload,
        DataTypes.Credit calldata credit,
        DataTypes.SwapAdapter calldata swapAdapter,
        bytes calldata swapPayload,
        IPoolAddressesProvider poolAddressProvider
    ) external {
        DataTypes.ExecuteMarketplaceParams memory params = _initParams(
            ps,
            poolAddressProvider
        );
        params.ethLeft = msg.value;
        _updateBuyParams(
            params,
            poolAddressProvider,
            marketplaceId,
            payload,
            credit,
            swapAdapter,
            swapPayload
        );

        _depositETH(params);
        _buyWithCredit(ps, params);
        _refundETH(params.ethLeft);
    }

    /**
     * @notice Implements the buyWithCredit feature. BuyWithCredit allows users to buy NFT from various NFT marketplaces
     * including OpenSea, LooksRare, X2Y2 etc. Users can use NFT's credit and will need to pay at most (1 - LTV) * $NFT
     * @dev  Emits the `BuyWithCredit()` event
     * @param ps The pool storage pointer
     * @param params The additional parameters needed to execute the buyWithCredit function
     */
    function _buyWithCredit(
        DataTypes.PoolStorage storage ps,
        DataTypes.ExecuteMarketplaceParams memory params
    ) internal {
        ValidationLogic.validateBuyWithCredit(params);

        MarketplaceLocalVars memory vars = _cache(
            ps,
            params,
            params.orderInfo.taker
        );

        bool delegate = !params.orderInfo.isSeaport || vars.isListingTokenETH;
        (address recipient, uint256 priceEth) = delegate
            ? (address(this), _delegateToPool(params, vars))
            : (params.orderInfo.taker, 0);

        _flashSupplyFor(ps, vars, params.orderInfo.maker);
        _flashLoanTo(ps, params, vars, recipient);

        // delegateCall to avoid extra token transfer
        Address.functionDelegateCall(
            params.marketplace.adapter,
            abi.encodeWithSelector(
                IMarketplace.matchAskWithTakerBid.selector,
                params.marketplace.marketplace,
                params.payload,
                priceEth
            )
        );

        _handleFlashSupplyRepayment(vars, params);
        _handleFlashLoanRepayment(ps, params, vars, params.orderInfo.taker);

        emit BuyWithCredit(
            params.marketplaceId,
            params.orderInfo,
            params.credit
        );
    }

    function executeBatchBuyWithCredit(
        DataTypes.PoolStorage storage ps,
        bytes32[] calldata marketplaceIds,
        bytes[] calldata payloads,
        DataTypes.Credit[] calldata credits,
        DataTypes.SwapAdapter[] calldata swapAdapters,
        bytes[] calldata swapPayloads,
        IPoolAddressesProvider poolAddressProvider
    ) external {
        require(
            marketplaceIds.length == payloads.length &&
                swapAdapters.length == payloads.length &&
                swapPayloads.length == payloads.length &&
                credits.length == payloads.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );

        DataTypes.ExecuteMarketplaceParams memory params = _initParams(
            ps,
            poolAddressProvider
        );
        params.ethLeft = msg.value;

        for (uint256 i = 0; i < marketplaceIds.length; i++) {
            _updateBuyParams(
                params,
                poolAddressProvider,
                marketplaceIds[i],
                payloads[i],
                credits[i],
                swapAdapters[i],
                swapPayloads[i]
            );

            // Once we encounter a listing using WETH, then we convert all our ethLeft to WETH
            // this also means that the parameters order is very important
            //
            // frontend/sdk needs to guarantee that WETH orders will always be put after ALL
            // ETH orders, all ETH orders after WETH orders will fail
            //
            // eg. The following example image that the `taker` owns only ETH and wants to
            // batch buy bunch of NFTs which are listed using WETH and ETH
            //
            // batchBuyWithCredit([ETH, WETH, ETH]) => ko
            //                            | -> convert all ethLeft to WETH, 3rd purchase will fail
            // batchBuyWithCredit([ETH, ETH, ETH]) => ok
            // batchBuyWithCredit([ETH, ETH, WETH]) => ok
            //
            _depositETH(params);
            _buyWithCredit(ps, params);
        }

        _refundETH(params.ethLeft);
    }

    function executeAcceptBidWithCredit(
        DataTypes.PoolStorage storage ps,
        bytes32 marketplaceId,
        bytes calldata payload,
        DataTypes.Credit calldata credit,
        address onBehalfOf,
        IPoolAddressesProvider poolAddressProvider
    ) external {
        DataTypes.ExecuteMarketplaceParams memory params = _initParams(
            ps,
            poolAddressProvider
        );
        _updateAcceptBidParams(
            params,
            poolAddressProvider,
            marketplaceId,
            payload,
            credit,
            onBehalfOf
        );

        _acceptBidWithCredit(ps, params);
    }

    function executeBatchAcceptBidWithCredit(
        DataTypes.PoolStorage storage ps,
        bytes32[] calldata marketplaceIds,
        bytes[] calldata payloads,
        DataTypes.Credit[] calldata credits,
        address onBehalfOf,
        IPoolAddressesProvider poolAddressProvider
    ) external {
        require(
            marketplaceIds.length == payloads.length &&
                payloads.length == credits.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        DataTypes.ExecuteMarketplaceParams memory params = _initParams(
            ps,
            poolAddressProvider
        );
        for (uint256 i = 0; i < marketplaceIds.length; i++) {
            _updateAcceptBidParams(
                params,
                poolAddressProvider,
                marketplaceIds[i],
                payloads[i],
                credits[i],
                onBehalfOf
            );

            _acceptBidWithCredit(ps, params);
        }
    }

    function executeAcceptOpenseaBid(
        DataTypes.PoolStorage storage ps,
        bytes32 marketplaceId,
        bytes calldata payload,
        address onBehalfOf,
        IPoolAddressesProvider poolAddressProvider
    ) external {
        DataTypes.ExecuteMarketplaceParams memory params = _initParams(
            ps,
            poolAddressProvider
        );
        _updateAcceptBidParams(
            params,
            poolAddressProvider,
            marketplaceId,
            payload,
            DataTypes.Credit(
                address(0),
                0,
                bytes(""),
                0,
                bytes32(""),
                bytes32("")
            ),
            onBehalfOf
        );

        _acceptOpenseaBid(ps, params);
    }

    function executeBatchAcceptOpenseaBid(
        DataTypes.PoolStorage storage ps,
        bytes32[] calldata marketplaceIds,
        bytes[] calldata payloads,
        address onBehalfOf,
        IPoolAddressesProvider poolAddressProvider
    ) external {
        require(
            marketplaceIds.length == payloads.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        DataTypes.ExecuteMarketplaceParams memory params = _initParams(
            ps,
            poolAddressProvider
        );

        for (uint256 i = 0; i < marketplaceIds.length; i++) {
            _updateAcceptBidParams(
                params,
                poolAddressProvider,
                marketplaceIds[i],
                payloads[i],
                DataTypes.Credit(
                    address(0),
                    0,
                    bytes(""),
                    0,
                    bytes32(""),
                    bytes32("")
                ),
                onBehalfOf
            );

            _acceptOpenseaBid(ps, params);
        }
    }

    /**
     * @notice Implements the acceptBidWithCredit feature. AcceptBidWithCredit allows users to
     * accept a leveraged bid on ParaSpace NFT marketplace. Users can submit leveraged bid and pay
     * at most (1 - LTV) * $NFT
     * @dev  Emits the `AcceptBidWithCredit()` event
     * @param ps The pool storage
     * @param params The additional parameters needed to execute the acceptBidWithCredit function
     */
    function _acceptBidWithCredit(
        DataTypes.PoolStorage storage ps,
        DataTypes.ExecuteMarketplaceParams memory params
    ) internal {
        ValidationLogic.validateAcceptBidWithCredit(params);

        MarketplaceLocalVars memory vars = _cache(
            ps,
            params,
            params.orderInfo.maker
        );

        _flashSupplyFor(ps, vars, params.orderInfo.taker);
        _flashLoanTo(ps, params, vars, params.orderInfo.maker);

        // delegateCall to avoid extra token transfer
        Address.functionDelegateCall(
            params.marketplace.adapter,
            abi.encodeWithSelector(
                IMarketplace.matchBidWithTakerAsk.selector,
                params.marketplace.marketplace,
                params.payload
            )
        );

        _handleFlashSupplyRepayment(vars, params);
        _handleFlashLoanRepayment(ps, params, vars, params.orderInfo.maker);

        emit AcceptBidWithCredit(
            params.marketplaceId,
            params.orderInfo,
            params.credit
        );
    }

    function _acceptOpenseaBid(
        DataTypes.PoolStorage storage ps,
        DataTypes.ExecuteMarketplaceParams memory params
    ) internal {
        ValidationLogic.validateAcceptOpenseaBid(params);

        MarketplaceLocalVars memory vars = _cache(
            ps,
            params,
            params.orderInfo.maker
        );

        _flashSupplyFor(ps, vars, params.orderInfo.taker);
        _withdrawERC721For(ps, params, vars, params.orderInfo.taker);

        // delegateCall to avoid extra token transfer
        Address.functionDelegateCall(
            params.marketplace.adapter,
            abi.encodeWithSelector(
                IMarketplace.matchBidWithTakerAsk.selector,
                params.marketplace.marketplace,
                params.payload
            )
        );

        _handleFlashSupplyRepayment(vars, params);

        emit AcceptBidWithCredit(
            params.marketplaceId,
            params.orderInfo,
            params.credit
        );
    }

    function _delegateToPool(
        DataTypes.ExecuteMarketplaceParams memory params,
        MarketplaceLocalVars memory vars
    ) internal returns (uint256 priceEth) {
        uint256 downpayment = vars.price - vars.creditAmount;
        if (!vars.isListingTokenETH) {
            IERC20(params.orderInfo.consideration[0].token).safeTransferFrom(
                params.orderInfo.taker,
                address(this),
                downpayment
            );
            Helpers.checkMaxAllowance(
                params.orderInfo.consideration[0].token,
                params.marketplace.operator
            );
        } else {
            params.ethLeft -= downpayment;
            priceEth = vars.price;
        }
    }

    /**
     * @notice Borrow credit.amount from `credit.token` reserve without collateral. The corresponding
     * debt will be minted in the same block to the borrower.
     * @dev
     * @param ps The pool storage pointer
     * @param params The additional parameters needed to execute the buyWithCredit/acceptBidWithCredit function
     * @param vars The marketplace local vars for caching storage values for future reads
     * @param to The origin receiver of borrowed tokens
     */
    function _flashLoanTo(
        DataTypes.PoolStorage storage ps,
        DataTypes.ExecuteMarketplaceParams memory params,
        MarketplaceLocalVars memory vars,
        address to
    ) internal {
        if (vars.creditAmount == 0) {
            return;
        }

        DataTypes.TimeLockParams memory timeLockParams;
        vars.borrowAmount = vars.creditAmount;
        address transit = vars.isListingTokenPToken ? address(this) : to;

        if (vars.listingToken == vars.creditToken) {
            IPToken(vars.creditXTokenAddress).transferUnderlyingTo(
                transit,
                vars.creditAmount,
                timeLockParams
            );
        } else {
            DataTypes.SwapInfo memory swapInfo = ISwapAdapter(
                params.swapAdapter.adapter
            ).getSwapInfo(params.swapPayload, false);
            ValidationLogic.validateSwap(
                swapInfo,
                DataTypes.ValidateSwapParams({
                    swapAdapter: params.swapAdapter,
                    amount: vars.creditAmount,
                    srcToken: vars.creditToken,
                    dstToken: vars.listingToken,
                    dstReceiver: vars.creditXTokenAddress
                })
            );
            vars.borrowAmount = IPToken(vars.creditXTokenAddress)
                .swapAndTransferUnderlyingTo(
                    transit,
                    timeLockParams,
                    params.swapAdapter,
                    params.swapPayload,
                    swapInfo
                );
        }

        if (vars.isListingTokenETH && transit == address(this)) {
            // No re-entrancy because it sent to our contract address
            IWETH(params.weth).withdraw(vars.creditAmount);
        } else if (vars.isListingTokenPToken) {
            SupplyLogic.executeSupply(
                ps._reserves,
                ps._usersConfig[to],
                DataTypes.ExecuteSupplyParams({
                    asset: vars.listingToken,
                    amount: vars.creditAmount,
                    onBehalfOf: to,
                    payer: transit,
                    referralCode: 0
                })
            );
        }
    }

    /**
     * @notice Flash mint the supplyAmount of listingPrice as pToken so that seller's NFT can be traded in advance.
     * Repayment needs to be done after the marketplace exchange by transferring funds to xTokenAddress
     * @dev
     * @param ps The pool storage pointer
     * @param vars The marketplace local vars for caching storage values for future reads
     * @param seller The NFT seller
     */
    function _flashSupplyFor(
        DataTypes.PoolStorage storage ps,
        MarketplaceLocalVars memory vars,
        address seller
    ) internal {
        if (vars.supplyAmount == 0) {
            return;
        }

        DataTypes.ReserveData storage reserve = ps._reserves[vars.listingToken];
        DataTypes.UserConfigurationMap storage sellerConfig = ps._usersConfig[
            seller
        ];
        DataTypes.ReserveCache memory reserveCache = reserve.cache();
        uint16 reserveId = reserve.id; // cache to reduce one storage read

        bool willUpdateRateLater = (vars.isListingTokenPToken ||
            vars.listingToken == vars.creditToken) && vars.creditAmount != 0;
        if (!willUpdateRateLater) {
            reserve.updateState(reserveCache);
            reserve.updateInterestRates(
                reserveCache,
                vars.listingToken,
                vars.isListingTokenPToken ? 0 : vars.supplyAmount,
                0
            );
            vars.listingTokenNextLiquidityIndex = reserveCache
                .nextLiquidityIndex;
        } else {
            uint256 cumulatedLiquidityInterest = MathUtils
                .calculateLinearInterest(
                    reserveCache.currLiquidityRate,
                    reserveCache.reserveLastUpdateTimestamp
                );
            vars.listingTokenNextLiquidityIndex = cumulatedLiquidityInterest
                .rayMul(reserveCache.currLiquidityIndex);
        }

        bool isFirstSupply = IPToken(reserveCache.xTokenAddress).mint(
            msg.sender,
            seller,
            vars.supplyAmount,
            vars.listingTokenNextLiquidityIndex
        );

        if (isFirstSupply || !sellerConfig.isUsingAsCollateral(reserveId)) {
            sellerConfig.setUsingAsCollateral(reserveId, true);
            emit ReserveUsedAsCollateralEnabled(vars.listingToken, seller);
        }
    }

    function _withdrawERC721For(
        DataTypes.PoolStorage storage ps,
        DataTypes.ExecuteMarketplaceParams memory params,
        MarketplaceLocalVars memory vars,
        address seller
    ) internal {
        if (vars.collectionXTokenAddress == address(0)) {
            return;
        }

        uint256 size = params.orderInfo.offer.length;
        uint256[] memory tokenIds = new uint256[](size);
        uint256 amountToWithdraw;
        for (uint256 i = 0; i < size; i++) {
            OfferItem memory item = params.orderInfo.offer[i];
            uint256 tokenId = item.identifierOrCriteria;
            require(
                item.itemType == ItemType.ERC721,
                Errors.INVALID_ASSET_TYPE
            );
            require(
                item.token == params.orderInfo.offer[0].token,
                Errors.INVALID_MARKETPLACE_ORDER
            );

            if (
                IERC721(vars.collectionXTokenAddress).ownerOf(tokenId) == seller
            ) {
                tokenIds[amountToWithdraw++] = tokenId;
            }
        }

        if (amountToWithdraw > 0) {
            assembly {
                mstore(tokenIds, amountToWithdraw)
            }
            SupplyLogic.executeWithdrawERC721(
                ps._reserves,
                ps._reservesList,
                ps._usersConfig[seller],
                DataTypes.ExecuteWithdrawERC721Params({
                    asset: vars.collectionToken,
                    tokenIds: tokenIds,
                    to: seller,
                    reservesCount: params.reservesCount,
                    oracle: params.oracle,
                    timeLock: false
                })
            );
        }
    }

    /**
     * @notice Repay credit.amount by minting debt to the borrower. Borrower's received NFT
     * will also need to be supplied to the pool to provide bigger borrow limit.
     * @dev
     * @param ps The pool storage pointer
     * @param params The additional parameters needed to execute the buyWithCredit/acceptBidWithCredit function
     * @param vars The marketplace local vars for caching storage values for future reads
     * @param buyer The NFT buyer
     */
    function _handleFlashLoanRepayment(
        DataTypes.PoolStorage storage ps,
        DataTypes.ExecuteMarketplaceParams memory params,
        MarketplaceLocalVars memory vars,
        address buyer
    ) internal {
        _transferOrCollateralize(ps, params, vars, buyer);

        if (vars.creditAmount == 0) {
            return;
        }

        BorrowLogic.executeBorrow(
            ps._reserves,
            ps._reservesList,
            ps._usersConfig[buyer],
            DataTypes.ExecuteBorrowParams({
                asset: vars.creditToken,
                user: buyer,
                onBehalfOf: buyer,
                amount: vars.borrowAmount,
                referralCode: 0,
                releaseUnderlying: false,
                reservesCount: params.reservesCount,
                oracle: params.oracle,
                priceOracleSentinel: params.priceOracleSentinel,
                swapAdapter: DataTypes.SwapAdapter(
                    address(0),
                    address(0),
                    false
                ),
                swapPayload: bytes("")
            })
        );
    }

    /**
     * @notice "Repay" minted pToken by transferring funds from the seller to xTokenAddress
     * @dev
     * @param vars The marketplace local vars for caching storage values for future reads
     * @param params The additional parameters needed to execute the buyWithCredit function
     */
    function _handleFlashSupplyRepayment(
        MarketplaceLocalVars memory vars,
        DataTypes.ExecuteMarketplaceParams memory params
    ) internal {
        if (vars.supplyAmount == 0) {
            return;
        }

        if (vars.isListingTokenPToken) {
            DataTypes.TimeLockParams memory timeLockParams;
            IPToken(vars.listingXTokenAddress).burn(
                address(this),
                vars.listingXTokenAddress,
                vars.supplyAmount,
                vars.listingTokenNextLiquidityIndex,
                timeLockParams
            );
        } else {
            if (vars.isListingTokenETH) {
                IWETH(params.weth).deposit{value: vars.supplyAmount}();
            }

            IERC20(vars.listingToken).safeTransfer(
                vars.listingXTokenAddress,
                vars.supplyAmount
            );
        }
    }

    function _cache(
        DataTypes.PoolStorage storage ps,
        DataTypes.ExecuteMarketplaceParams memory params,
        address buyer
    ) internal view returns (MarketplaceLocalVars memory vars) {
        vars.creditToken = params.credit.token;
        vars.creditAmount = params.credit.amount;
        vars.creditXTokenAddress = ps._reserves[vars.creditToken].xTokenAddress;

        vars.isListingTokenETH =
            params.orderInfo.consideration[0].token == address(0);

        if (vars.isListingTokenETH) {
            vars.listingToken = params.weth;
            vars.listingXTokenAddress = ps
                ._reserves[vars.listingToken]
                .xTokenAddress;
        } else {
            vars.listingToken = params.orderInfo.consideration[0].token;
            vars.listingXTokenAddress = ps
                ._reserves[vars.listingToken]
                .xTokenAddress;
            if (vars.listingXTokenAddress == address(0)) {
                try
                    IPToken(vars.listingToken).UNDERLYING_ASSET_ADDRESS()
                returns (address underlyingAsset) {
                    vars.isListingTokenPToken =
                        ps._reserves[underlyingAsset].xTokenAddress ==
                        vars.listingToken;
                    if (vars.isListingTokenPToken) {
                        vars.listingXTokenAddress = vars.listingToken;
                        vars.listingToken = underlyingAsset;
                    }
                } catch {}
            }
        }

        (vars.price, vars.supplyAmount) = _validateConsideration(
            params,
            vars,
            buyer
        );

        _validateOffer(ps, params, vars);
    }

    function _initParams(
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider
    ) internal view returns (DataTypes.ExecuteMarketplaceParams memory params) {
        params.weth = poolAddressProvider.getWETH();
        params.reservesCount = ps._reservesCount;
        params.oracle = poolAddressProvider.getPriceOracle();
        params.priceOracleSentinel = poolAddressProvider
            .getPriceOracleSentinel();
    }

    function _updateBuyParams(
        DataTypes.ExecuteMarketplaceParams memory params,
        IPoolAddressesProvider poolAddressProvider,
        bytes32 marketplaceId,
        bytes memory payload,
        DataTypes.Credit memory credit,
        DataTypes.SwapAdapter memory swapAdapter,
        bytes memory swapPayload
    ) internal view {
        params.marketplaceId = marketplaceId;
        params.marketplace = poolAddressProvider.getMarketplace(marketplaceId);
        params.payload = payload;
        params.credit = credit;
        params.swapAdapter = swapAdapter;
        params.swapPayload = swapPayload;

        params.orderInfo = IMarketplace(params.marketplace.adapter)
            .getAskOrderInfo(payload);
        if (params.orderInfo.isSeaport) {
            require(
                msg.sender == params.orderInfo.taker,
                Errors.INVALID_ORDER_TAKER
            );
        } else {
            // in LooksRare, X2Y2 we dont match orders between buyer and seller
            // the protocol just works like an agent so taker cannot be read
            // from orders
            params.orderInfo.taker = msg.sender;
        }
        require(
            params.orderInfo.maker != params.orderInfo.taker,
            Errors.MAKER_SAME_AS_TAKER
        );
    }

    function _updateAcceptBidParams(
        DataTypes.ExecuteMarketplaceParams memory params,
        IPoolAddressesProvider poolAddressProvider,
        bytes32 marketplaceId,
        bytes memory payload,
        DataTypes.Credit memory credit,
        address onBehalfOf
    ) internal view {
        params.marketplaceId = marketplaceId;
        params.marketplace = poolAddressProvider.getMarketplace(marketplaceId);
        params.payload = payload;
        params.credit = credit;

        params.orderInfo = IMarketplace(params.marketplace.adapter)
            .getBidOrderInfo(payload);
        require(
            params.orderInfo.taker == onBehalfOf,
            Errors.INVALID_ORDER_TAKER
        );
    }

    function _refundETH(uint256 ethLeft) internal {
        if (ethLeft > 0) {
            Address.sendValue(payable(msg.sender), ethLeft);
        }
    }

    function _depositETH(DataTypes.ExecuteMarketplaceParams memory params)
        internal
    {
        if (
            params.ethLeft == 0 ||
            params.orderInfo.consideration[0].itemType == ItemType.NATIVE
        ) {
            return;
        }

        IWETH(params.weth).deposit{value: params.ethLeft}();
        IERC20(params.weth).safeTransferFrom(
            address(this),
            msg.sender,
            params.ethLeft
        );

        params.ethLeft = 0;
    }

    function _transferOrCollateralize(
        DataTypes.PoolStorage storage ps,
        DataTypes.ExecuteMarketplaceParams memory params,
        MarketplaceLocalVars memory vars,
        address buyer
    ) internal {
        DataTypes.ERC721SupplyParams[]
            memory tokenData = new DataTypes.ERC721SupplyParams[](
                params.orderInfo.offer.length
            );
        uint256[] memory tokenIds = new uint256[](
            params.orderInfo.offer.length
        );
        uint256 amountToSupply;
        uint256 amountToCollateralize;
        address payer;

        for (uint256 i = 0; i < params.orderInfo.offer.length; i++) {
            OfferItem memory item = params.orderInfo.offer[i];
            require(
                item.itemType == ItemType.ERC721,
                Errors.INVALID_ASSET_TYPE
            );
            require(
                item.token == params.orderInfo.offer[0].token,
                Errors.INVALID_MARKETPLACE_ORDER
            );
            if (!vars.isCollectionListed) {
                address owner = IERC721(vars.collectionToken).ownerOf(
                    item.identifierOrCriteria
                );
                if (owner == address(this)) {
                    IERC721(vars.collectionToken).safeTransferFrom(
                        address(this),
                        buyer,
                        item.identifierOrCriteria
                    );
                } else {
                    require(owner == buyer, Errors.INVALID_MARKETPLACE_ORDER);
                }
            } else {
                address nTokenOwner = IERC721(vars.collectionXTokenAddress)
                    .ownerOf(item.identifierOrCriteria);
                if (nTokenOwner != address(0)) {
                    if (nTokenOwner == address(this)) {
                        IERC721(vars.collectionXTokenAddress).safeTransferFrom(
                            address(this),
                            buyer,
                            item.identifierOrCriteria
                        );
                    } else {
                        require(
                            nTokenOwner == buyer,
                            Errors.INVALID_MARKETPLACE_ORDER
                        );
                    }
                    tokenIds[amountToCollateralize++] = item
                        .identifierOrCriteria;
                } else {
                    address owner = IERC721(vars.collectionToken).ownerOf(
                        item.identifierOrCriteria
                    );
                    require(
                        owner == buyer || owner == address(this),
                        Errors.INVALID_MARKETPLACE_ORDER
                    );
                    if (payer == address(0)) {
                        payer = owner;
                    } else {
                        require(
                            payer == owner,
                            Errors.INVALID_MARKETPLACE_ORDER
                        );
                    }
                    tokenData[amountToSupply++] = DataTypes.ERC721SupplyParams(
                        item.identifierOrCriteria,
                        true
                    );
                }
            }
        }

        if (amountToSupply > 0) {
            assembly {
                mstore(tokenData, amountToSupply)
            }
            SupplyLogic.executeSupplyERC721(
                ps._reserves,
                ps._usersConfig[buyer],
                DataTypes.ExecuteSupplyERC721Params({
                    asset: vars.collectionToken,
                    tokenData: tokenData,
                    onBehalfOf: buyer,
                    payer: payer,
                    referralCode: 0
                })
            );
        }

        if (amountToCollateralize > 0) {
            assembly {
                mstore(tokenIds, amountToCollateralize)
            }
            SupplyLogic.executeCollateralizeERC721(
                ps._reserves,
                ps._usersConfig[buyer],
                vars.collectionToken,
                tokenIds,
                buyer
            );
        }
    }

    function _validateConsideration(
        DataTypes.ExecuteMarketplaceParams memory params,
        MarketplaceLocalVars memory vars,
        address buyer
    ) internal view returns (uint256 price, uint256 supplyAmount) {
        uint256 size = params.orderInfo.consideration.length;
        ConsiderationItem memory lastItem = params.orderInfo.consideration[
            size - 1
        ];
        ItemType requiredItemType = vars.isListingTokenETH
            ? ItemType.NATIVE
            : ItemType.ERC20;

        if (lastItem.itemType == ItemType.ERC721) {
            require(
                lastItem.recipient == buyer && --size > 0,
                Errors.INVALID_MARKETPLACE_ORDER
            );
        }

        for (uint256 i = 0; i < size; i++) {
            ConsiderationItem memory item = params.orderInfo.consideration[i];
            require(
                item.startAmount == item.endAmount,
                Errors.INVALID_MARKETPLACE_ORDER
            );
            require(
                item.itemType == requiredItemType,
                Errors.INVALID_ASSET_TYPE
            );
            require(
                item.token == params.orderInfo.consideration[0].token,
                Errors.INVALID_MARKETPLACE_ORDER
            );
            price += item.startAmount;

            // supplyAmount is a **message** from the seller to the protocol
            // to tell us the percentage of received funds to be supplied to be
            // able to transfer NFT out
            //
            // NOTE:
            // 1. this will only be useful in ParaSpace because listing on other platform
            // will not be able to specify paraspace pool
            // 2. paraspace pool as ERC20 recipient can avoid extra approval from seller
            // side
            if (item.recipient == address(this)) {
                supplyAmount += item.startAmount;
            }
        }
    }

    function _validateOffer(
        DataTypes.PoolStorage storage ps,
        DataTypes.ExecuteMarketplaceParams memory params,
        MarketplaceLocalVars memory vars
    ) internal view {
        vars.collectionToken = params.orderInfo.offer[0].token;
        vars.collectionXTokenAddress = ps
            ._reserves[vars.collectionToken]
            .xTokenAddress;
        vars.isCollectionListed = vars.collectionXTokenAddress != address(0);

        if (!vars.isCollectionListed) {
            try
                INToken(vars.collectionToken).UNDERLYING_ASSET_ADDRESS()
            returns (address underlyingAsset) {
                bool isNToken = ps._reserves[underlyingAsset].xTokenAddress ==
                    vars.collectionToken;
                if (isNToken) {
                    vars.collectionXTokenAddress = vars.collectionToken;
                    vars.collectionToken = underlyingAsset;
                    vars.isCollectionListed = true;
                }
            } catch {}
        }

        require(
            !vars.isCollectionListed ||
                INToken(vars.collectionXTokenAddress).getXTokenType() !=
                XTokenType.NTokenUniswapV3,
            Errors.XTOKEN_TYPE_NOT_ALLOWED
        );
    }
}
