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
import {ReserveConfiguration} from "../configuration/ReserveConfiguration.sol";
import {IMarketplace} from "../../../interfaces/IMarketplace.sol";
import {Address} from "../../../dependencies/openzeppelin/contracts/Address.sol";
import {ISwapAdapter} from "../../../interfaces/ISwapAdapter.sol";
import {Helpers} from "../../../protocol/libraries/helpers/Helpers.sol";

/**
 * @title Marketplace library
 *
 * @notice Implements the base logic for all the actions related to NFT buy/accept bid
 */
library MarketplaceLogic {
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using ReserveLogic for DataTypes.ReserveData;
    using SafeERC20 for IERC20;
    using Math for uint256;
    using PercentageMath for uint256;

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
        uint256 listingTokenNextLiquidityIndex;
        address listingToken;
        address listingXTokenAddress;
        address creditToken;
        address creditXTokenAddress;
        uint256 creditAmount;
        uint256 borrowAmount;
        uint256 supplyAmount;
        address xTokenAddress;
        uint256 price;
        uint256 ethLeft;
        // used to avoid stack too deep
        bytes32 marketplaceId;
        bytes payload;
        DataTypes.Credit credit;
        DataTypes.SwapAdapter swapAdapter;
        bytes swapPayload;
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
        MarketplaceLocalVars memory vars;

        vars.ethLeft = msg.value;
        DataTypes.ExecuteMarketplaceParams memory params = _getParams(
            ps,
            poolAddressProvider,
            marketplaceId,
            payload,
            credit,
            swapAdapter,
            swapPayload
        );
        params.orderInfo = IMarketplace(params.marketplace.adapter)
            .getAskOrderInfo(payload);
        if (params.orderInfo.isSeaport) {
            require(
                msg.sender == params.orderInfo.taker,
                Errors.INVALID_ORDER_TAKER
            );
        } else {
            params.orderInfo.taker = msg.sender;
        }
        require(
            params.orderInfo.maker != params.orderInfo.taker,
            Errors.MAKER_SAME_AS_TAKER
        );

        _depositETH(vars, params);

        params.ethLeft = vars.ethLeft;

        vars.ethLeft -= _buyWithCredit(ps, params);

        _refundETH(vars.ethLeft);
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
    ) internal returns (uint256) {
        ValidationLogic.validateBuyWithCredit(params);

        MarketplaceLocalVars memory vars = _cache(
            ps,
            params,
            params.orderInfo.taker
        );

        bool delegate = !params.orderInfo.isSeaport || vars.isListingTokenETH;

        _flashSupplyFor(ps, vars, params.orderInfo.maker);
        _flashLoanTo(
            ps,
            params,
            vars,
            delegate ? address(this) : params.orderInfo.taker
        );

        (uint256 priceEth, uint256 downpaymentEth) = delegate
            ? _delegateToPool(params, vars)
            : (0, 0);

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

        return downpaymentEth;
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
        MarketplaceLocalVars memory vars;

        require(
            marketplaceIds.length == payloads.length &&
                swapAdapters.length == payloads.length &&
                swapPayloads.length == payloads.length &&
                credits.length == payloads.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        vars.ethLeft = msg.value;

        for (uint256 i = 0; i < marketplaceIds.length; i++) {
            vars.marketplaceId = marketplaceIds[i];
            vars.payload = payloads[i];
            vars.credit = credits[i];
            vars.swapAdapter = swapAdapters[i];
            vars.swapPayload = swapPayloads[i];
            DataTypes.ExecuteMarketplaceParams memory params = _getParams(
                ps,
                poolAddressProvider,
                vars.marketplaceId,
                vars.payload,
                vars.credit,
                vars.swapAdapter,
                vars.swapPayload
            );
            params.orderInfo = IMarketplace(params.marketplace.adapter)
                .getAskOrderInfo(vars.payload);
            if (params.orderInfo.isSeaport) {
                require(
                    msg.sender == params.orderInfo.taker,
                    Errors.INVALID_ORDER_TAKER
                );
            } else {
                params.orderInfo.taker = msg.sender;
            }
            require(
                params.orderInfo.maker != params.orderInfo.taker,
                Errors.MAKER_SAME_AS_TAKER
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
            _depositETH(vars, params);

            params.ethLeft = vars.ethLeft;

            vars.ethLeft -= _buyWithCredit(ps, params);
        }

        _refundETH(vars.ethLeft);
    }

    function executeAcceptBidWithCredit(
        DataTypes.PoolStorage storage ps,
        bytes32 marketplaceId,
        bytes calldata payload,
        DataTypes.Credit calldata credit,
        address onBehalfOf,
        IPoolAddressesProvider poolAddressProvider
    ) external {
        DataTypes.ExecuteMarketplaceParams memory params = _getParams(
            ps,
            poolAddressProvider,
            marketplaceId,
            payload,
            credit,
            DataTypes.SwapAdapter(address(0), address(0), false),
            bytes("")
        );
        params.orderInfo = IMarketplace(params.marketplace.adapter)
            .getBidOrderInfo(payload);

        require(
            params.orderInfo.taker == onBehalfOf,
            Errors.INVALID_ORDER_TAKER
        );

        _acceptBidWithCredit(ps, params);
    }

    function executeAcceptOpenseaBid(
        DataTypes.PoolStorage storage ps,
        bytes32 marketplaceId,
        bytes calldata payload,
        address onBehalfOf,
        IPoolAddressesProvider poolAddressProvider
    ) external {
        DataTypes.ExecuteMarketplaceParams memory params = _getParams(
            ps,
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
            DataTypes.SwapAdapter(address(0), address(0), false),
            bytes("")
        );
        params.orderInfo = IMarketplace(params.marketplace.adapter)
            .getBidOrderInfo(payload);

        require(
            params.orderInfo.taker == onBehalfOf,
            Errors.INVALID_ORDER_TAKER
        );

        _acceptOpenseaBid(ps, params);
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
        for (uint256 i = 0; i < marketplaceIds.length; i++) {
            DataTypes.ExecuteMarketplaceParams memory params = _getParams(
                ps,
                poolAddressProvider,
                marketplaceIds[i],
                payloads[i],
                credits[i],
                DataTypes.SwapAdapter(address(0), address(0), false),
                bytes("")
            );
            params.orderInfo = IMarketplace(params.marketplace.adapter)
                .getBidOrderInfo(payloads[i]);

            require(
                params.orderInfo.taker == onBehalfOf,
                Errors.INVALID_ORDER_TAKER
            );

            _acceptBidWithCredit(ps, params);
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
    ) internal returns (uint256, uint256) {
        uint256 price = vars.price;
        uint256 downpayment = price - vars.creditAmount;
        if (!vars.isListingTokenETH) {
            address transferToken = vars.isListingTokenPToken
                ? vars.listingXTokenAddress
                : vars.listingToken;
            IERC20(transferToken).safeTransferFrom(
                params.orderInfo.taker,
                address(this),
                downpayment
            );
            Helpers.checkMaxAllowance(
                transferToken,
                params.marketplace.operator
            );

            // convert to (priceEth, downpaymentEth)
            price = 0;
            downpayment = 0;
        } else {
            require(params.ethLeft >= downpayment, Errors.PAYNOW_NOT_ENOUGH);
        }

        return (price, downpayment);
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

        reserve.updateState(reserveCache);

        bool willUpdateRateLater = vars.listingToken == vars.creditToken &&
            vars.creditAmount != 0;
        if (!willUpdateRateLater) {
            reserve.updateInterestRates(
                reserveCache,
                vars.listingToken,
                vars.isListingTokenPToken ? 0 : vars.supplyAmount,
                0
            );
        }

        vars.listingTokenNextLiquidityIndex = reserveCache.nextLiquidityIndex;

        bool isFirstSupply = IPToken(reserveCache.xTokenAddress).mint(
            msg.sender,
            seller,
            vars.supplyAmount,
            reserveCache.nextLiquidityIndex
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
        uint256 size = params.orderInfo.offer.length;
        uint256[] memory tokenIds = new uint256[](size);

        address token = params.orderInfo.offer[0].token;
        vars.xTokenAddress = ps._reserves[token].xTokenAddress;
        uint256 amountToWithdraw;

        if (vars.xTokenAddress == address(0)) {
            return;
        }

        for (uint256 i = 0; i < size; i++) {
            OfferItem memory item = params.orderInfo.offer[i];
            uint256 tokenId = item.identifierOrCriteria;
            require(
                item.itemType == ItemType.ERC721,
                Errors.INVALID_ASSET_TYPE
            );
            require(item.token == token, Errors.INVALID_MARKETPLACE_ORDER);

            if (IERC721(vars.xTokenAddress).ownerOf(tokenId) == seller) {
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
                    asset: token,
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
        for (uint256 i = 0; i < params.orderInfo.offer.length; i++) {
            OfferItem memory item = params.orderInfo.offer[i];
            require(
                item.itemType == ItemType.ERC721,
                Errors.INVALID_ASSET_TYPE
            );

            // underlyingAsset
            address token = item.token;
            uint256 tokenId = item.identifierOrCriteria;
            // NToken
            vars.xTokenAddress = ps._reserves[token].xTokenAddress;
            bool isReserve = vars.xTokenAddress != address(0);

            if (!isReserve) {
                try INToken(token).UNDERLYING_ASSET_ADDRESS() returns (
                    address underlyingAsset
                ) {
                    bool isNToken = ps
                        ._reserves[underlyingAsset]
                        .xTokenAddress == token;
                    if (isNToken) {
                        vars.xTokenAddress = token;
                        token = underlyingAsset;
                        isReserve = true;
                    }
                } catch {}
            }

            require(
                !isReserve ||
                    INToken(vars.xTokenAddress).getXTokenType() !=
                    XTokenType.NTokenUniswapV3,
                Errors.XTOKEN_TYPE_NOT_ALLOWED
            );

            _transferOrCollateralize(
                ps,
                vars,
                buyer,
                token,
                tokenId,
                isReserve
            );
        }

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

        vars.isListingTokenETH =
            params.orderInfo.consideration[0].token == address(0);
        vars.listingToken = vars.isListingTokenETH
            ? params.weth
            : params.orderInfo.consideration[0].token;

        vars.creditXTokenAddress = ps._reserves[vars.creditToken].xTokenAddress;
        vars.listingXTokenAddress = ps
            ._reserves[vars.listingToken]
            .xTokenAddress;

        if (
            !vars.isListingTokenETH && vars.listingXTokenAddress == address(0)
        ) {
            try IPToken(vars.listingToken).UNDERLYING_ASSET_ADDRESS() returns (
                address underlyingAsset
            ) {
                vars.isListingTokenPToken =
                    ps._reserves[underlyingAsset].xTokenAddress ==
                    vars.listingToken;
                if (vars.isListingTokenPToken) {
                    vars.listingXTokenAddress = vars.listingToken;
                    vars.listingToken = underlyingAsset;
                }
            } catch {}
        }

        (vars.price, vars.supplyAmount) = _validateAndGetPriceAndSupplyAmount(
            params,
            vars,
            buyer
        );

        // either the seller & buyer decided to not use any credit
        // OR
        // the creditToken/listingXToken must be listed since otherwise cannot borrow from the pool
        require(
            (vars.creditAmount == 0 ||
                vars.creditXTokenAddress != address(0)) &&
                (vars.supplyAmount == 0 ||
                    vars.listingXTokenAddress != address(0)),
            Errors.ASSET_NOT_LISTED
        );
    }

    function _getParams(
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider,
        bytes32 marketplaceId,
        bytes memory payload,
        DataTypes.Credit memory credit,
        DataTypes.SwapAdapter memory swapAdapter,
        bytes memory swapPayload
    ) internal view returns (DataTypes.ExecuteMarketplaceParams memory params) {
        params.marketplaceId = marketplaceId;
        params.weth = poolAddressProvider.getWETH();
        params.marketplace = poolAddressProvider.getMarketplace(marketplaceId);
        params.payload = payload;
        params.credit = credit;
        params.swapAdapter = swapAdapter;
        params.swapPayload = swapPayload;
        params.reservesCount = ps._reservesCount;
        params.oracle = poolAddressProvider.getPriceOracle();
        params.priceOracleSentinel = poolAddressProvider
            .getPriceOracleSentinel();
    }

    function _refundETH(uint256 ethLeft) internal {
        if (ethLeft > 0) {
            Address.sendValue(payable(msg.sender), ethLeft);
        }
    }

    function _depositETH(
        MarketplaceLocalVars memory vars,
        DataTypes.ExecuteMarketplaceParams memory params
    ) internal {
        if (
            vars.ethLeft == 0 ||
            params.orderInfo.consideration[0].itemType == ItemType.NATIVE
        ) {
            return;
        }

        IWETH(params.weth).deposit{value: vars.ethLeft}();
        IERC20(params.weth).safeTransferFrom(
            address(this),
            msg.sender,
            vars.ethLeft
        );
        vars.ethLeft = 0;
    }

    function _transferOrCollateralize(
        DataTypes.PoolStorage storage ps,
        MarketplaceLocalVars memory vars,
        address buyer,
        address token,
        uint256 tokenId,
        bool isReserve
    ) internal {
        address owner = IERC721(token).ownerOf(tokenId);
        if (!isReserve) {
            if (owner == address(this)) {
                IERC721(token).safeTransferFrom(address(this), buyer, tokenId);
            } else {
                require(owner == buyer, Errors.INVALID_MARKETPLACE_ORDER);
            }
        } else {
            address nTokenOwner = IERC721(vars.xTokenAddress).ownerOf(tokenId);
            if (nTokenOwner != address(0)) {
                if (nTokenOwner == address(this)) {
                    IERC721(vars.xTokenAddress).safeTransferFrom(
                        address(this),
                        buyer,
                        tokenId
                    );
                } else {
                    require(
                        nTokenOwner == buyer,
                        Errors.INVALID_MARKETPLACE_ORDER
                    );
                }
                uint256[] memory tokenIds = new uint256[](1);
                tokenIds[0] = tokenId;
                SupplyLogic.executeCollateralizeERC721(
                    ps._reserves,
                    ps._usersConfig[buyer],
                    token,
                    tokenIds,
                    buyer
                );
            } else {
                require(
                    owner == buyer || owner == address(this),
                    Errors.INVALID_MARKETPLACE_ORDER
                );
                DataTypes.ERC721SupplyParams[]
                    memory tokenData = new DataTypes.ERC721SupplyParams[](1);
                tokenData[0] = DataTypes.ERC721SupplyParams(tokenId, true);
                SupplyLogic.executeSupplyERC721(
                    ps._reserves,
                    ps._usersConfig[buyer],
                    DataTypes.ExecuteSupplyERC721Params({
                        asset: token,
                        tokenData: tokenData,
                        onBehalfOf: buyer,
                        payer: owner,
                        referralCode: 0
                    })
                );
            }
        }
    }

    function _validateAndGetPriceAndSupplyAmount(
        DataTypes.ExecuteMarketplaceParams memory params,
        MarketplaceLocalVars memory vars,
        address buyer
    ) internal view returns (uint256 price, uint256 supplyAmount) {
        uint256 size = params.orderInfo.consideration.length;
        ConsiderationItem memory lastItem = params.orderInfo.consideration[
            size - 1
        ];

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
                item.itemType == ItemType.ERC20 ||
                    (vars.isListingTokenETH &&
                        item.itemType == ItemType.NATIVE),
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
            if (item.recipient == address(this)) {
                supplyAmount += item.startAmount;
            }
        }
    }
}
