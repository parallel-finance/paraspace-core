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
        address listingToken;
        address listingXTokenAddress;
        address creditToken;
        address creditXTokenAddress;
        uint256 creditAmount;
        uint256 creditAmountInListingToken;
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
        params.ethLeft = vars.ethLeft;
        params.orderInfo.taker = msg.sender;

        _depositETH(vars, params);

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

        MarketplaceLocalVars memory vars = _cache(ps, params);

        _flashSupplyFor(ps, vars, params.orderInfo.maker);
        _flashLoanTo(ps, params, vars, address(this));

        (uint256 priceEth, uint256 downpaymentEth) = _delegateToPool(
            params,
            vars
        );

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

        _handleFlashSupplyRepayment(params, vars);
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
            params.orderInfo.taker = msg.sender;
            params.ethLeft = vars.ethLeft;

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

        MarketplaceLocalVars memory vars = _cache(ps, params);

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

        _handleFlashSupplyRepayment(params, vars);
        _handleFlashLoanRepayment(ps, params, vars, params.orderInfo.maker);

        emit AcceptBidWithCredit(
            params.marketplaceId,
            params.orderInfo,
            params.credit
        );
    }

    /**
     * @notice Transfer payNow portion from taker to this contract. This is only useful
     * in buyWithCredit.
     * @dev
     * @param params The additional parameters needed to execute the buyWithCredit/acceptBidWithCredit function
     * @param vars The marketplace local vars for caching storage values for future reads
     */
    function _delegateToPool(
        DataTypes.ExecuteMarketplaceParams memory params,
        MarketplaceLocalVars memory vars
    ) internal returns (uint256, uint256) {
        uint256 price = vars.price;
        uint256 downpayment = price - vars.creditAmountInListingToken;
        if (!vars.isListingTokenETH) {
            IERC20(vars.listingToken).safeTransferFrom(
                params.orderInfo.taker,
                address(this),
                downpayment
            );
            Helpers.checkAllowance(
                vars.listingToken,
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
     * @param to The receiver of borrowed tokens
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

        DataTypes.ReserveData storage reserve = ps._reserves[vars.creditToken];
        ValidationLogic.validateFlashloanSimple(reserve);
        DataTypes.TimeLockParams memory timeLockParams;
        vars.creditAmountInListingToken = vars.creditAmount;

        if (vars.listingToken == vars.creditToken) {
            IPToken(vars.creditXTokenAddress).transferUnderlyingTo(
                to,
                vars.creditAmount,
                timeLockParams
            );
        } else {
            DataTypes.SwapInfo memory swapInfo = ISwapAdapter(
                params.swapAdapter.adapter
            ).getSwapInfo(params.swapPayload);
            ValidationLogic.validateSwap(
                swapInfo,
                DataTypes.ValidateSwapParams({
                    swapAdapter: params.swapAdapter,
                    amount: vars.creditAmount,
                    srcToken: vars.creditToken,
                    dstReceiver: vars.creditXTokenAddress
                })
            );
            vars.creditAmountInListingToken = IPToken(vars.creditXTokenAddress)
                .swapUnderlyingTo(
                    to,
                    timeLockParams,
                    params.swapAdapter,
                    params.swapPayload,
                    swapInfo
                );
        }

        if (vars.isListingTokenETH) {
            // No re-entrancy because it sent to our contract address
            IWETH(params.weth).withdraw(vars.creditAmountInListingToken);
        }
    }

    /**
     * @notice Flash mint 90% of listingPrice as pToken so that seller's NFT can be traded in advance.
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

        ValidationLogic.validateSupply(
            reserveCache,
            vars.supplyAmount,
            DataTypes.AssetType.ERC20
        );

        reserve.updateInterestRates(
            reserveCache,
            vars.listingToken,
            vars.supplyAmount,
            0
        );

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

        emit Supply(
            vars.listingToken,
            msg.sender,
            seller,
            vars.supplyAmount,
            0
        );
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

            // item.token == NToken
            if (vars.xTokenAddress == address(0)) {
                try INToken(token).UNDERLYING_ASSET_ADDRESS() returns (
                    address underlyingAsset
                ) {
                    bool isNToken = ps
                        ._reserves[underlyingAsset]
                        .xTokenAddress == token;
                    require(isNToken, Errors.ASSET_NOT_LISTED);
                    vars.xTokenAddress = token;
                    token = underlyingAsset;
                } catch {
                    // token is not listed
                    IERC721(token).safeTransferFrom(
                        address(this),
                        buyer,
                        tokenId
                    );
                    continue;
                }
            }

            require(
                INToken(vars.xTokenAddress).getXTokenType() !=
                    XTokenType.NTokenUniswapV3,
                Errors.XTOKEN_TYPE_NOT_ALLOWED
            );

            // item.token == underlyingAsset but supplied after listing/offering
            // so NToken is transferred instead
            if (INToken(vars.xTokenAddress).ownerOf(tokenId) == address(this)) {
                _transferAndCollateralize(ps, vars, buyer, token, tokenId);
                // item.token == underlyingAsset and underlyingAsset stays in wallet
            } else {
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
                        payer: address(this),
                        referralCode: 0
                    })
                );
            }
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
                amount: vars.creditAmount,
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
     * @param params The additional parameters needed to execute the buyWithCredit/acceptBidWithCredit function
     * @param vars The marketplace local vars for caching storage values for future reads
     */
    function _handleFlashSupplyRepayment(
        DataTypes.ExecuteMarketplaceParams memory params,
        MarketplaceLocalVars memory vars
    ) internal {
        if (vars.supplyAmount == 0) {
            return;
        }

        if (vars.isListingTokenETH) {
            IWETH(params.weth).deposit{value: vars.supplyAmount}();
        }

        IERC20(vars.listingToken).safeTransfer(
            vars.listingXTokenAddress,
            vars.supplyAmount
        );
    }

    function _cache(
        DataTypes.PoolStorage storage ps,
        DataTypes.ExecuteMarketplaceParams memory params
    ) internal view returns (MarketplaceLocalVars memory vars) {
        vars.creditToken = params.credit.token;
        vars.creditAmount = params.credit.amount;

        vars.isListingTokenETH =
            params.orderInfo.consideration[0].token == address(0);
        vars.listingToken = vars.isListingTokenETH
            ? params.weth
            : params.orderInfo.consideration[0].token;

        (vars.price, vars.supplyAmount) = _validateAndGetPriceAndSupplyAmount(
            params,
            vars
        );
        vars.creditXTokenAddress = ps._reserves[vars.creditToken].xTokenAddress;
        vars.listingXTokenAddress = ps
            ._reserves[vars.listingToken]
            .xTokenAddress;

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
    ) internal returns (DataTypes.ExecuteMarketplaceParams memory params) {
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

    function _transferAndCollateralize(
        DataTypes.PoolStorage storage ps,
        MarketplaceLocalVars memory vars,
        address buyer,
        address token,
        uint256 tokenId
    ) internal {
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;

        IERC721(vars.xTokenAddress).safeTransferFrom(
            address(this),
            buyer,
            tokenId
        );
        SupplyLogic.executeCollateralizeERC721(
            ps._reserves,
            ps._usersConfig[buyer],
            token,
            tokenIds,
            buyer
        );
    }

    function _validateAndGetPriceAndSupplyAmount(
        DataTypes.ExecuteMarketplaceParams memory params,
        MarketplaceLocalVars memory vars
    ) internal view returns (uint256 price, uint256 supplyAmount) {
        for (uint256 i = 0; i < params.orderInfo.consideration.length; i++) {
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
                Errors.CREDIT_DOES_NOT_MATCH_ORDER
            );
            price += item.startAmount;

            // supplyAmount is a **message** from the seller to the protocol
            // to tell us the percentage of received funds to be supplied to be
            // able to transfer NFT out
            //
            // This will only be useful for ParaSpace marketplace
            if (item.recipient == address(this)) {
                supplyAmount += item.startAmount;
            }
        }
    }
}
