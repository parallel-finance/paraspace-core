// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IERC721} from "../../../dependencies/openzeppelin/contracts/IERC721.sol";
import {INToken} from "../../../interfaces/INToken.sol";
import {IPoolAddressesProvider} from "../../../interfaces/IPoolAddressesProvider.sol";
import {XTokenType} from "../../../interfaces/IXTokenType.sol";
import {ICollateralizableERC721} from "../../../interfaces/ICollateralizableERC721.sol";
import {DataTypes} from "../types/DataTypes.sol";
import {IPToken} from "../../../interfaces/IPToken.sol";
import {Errors} from "../helpers/Errors.sol";
import {ValidationLogic} from "./ValidationLogic.sol";
import {SupplyLogic} from "./SupplyLogic.sol";
import {BorrowLogic} from "./BorrowLogic.sol";
import {SeaportInterface} from "../../../dependencies/seaport/contracts/interfaces/SeaportInterface.sol";
import {SafeERC20} from "../../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../../dependencies/openzeppelin/contracts/IERC721.sol";
import {ConsiderationItem, OfferItem} from "../../../dependencies/seaport/contracts/lib/ConsiderationStructs.sol";
import {ItemType} from "../../../dependencies/seaport/contracts/lib/ConsiderationEnums.sol";
import {AdvancedOrder, CriteriaResolver, Fulfillment} from "../../../dependencies/seaport/contracts/lib/ConsiderationStructs.sol";
import {IWETH} from "../../../misc/interfaces/IWETH.sol";
import {UserConfiguration} from "../configuration/UserConfiguration.sol";
import {ReserveConfiguration} from "../configuration/ReserveConfiguration.sol";
import {IMarketplace} from "../../../interfaces/IMarketplace.sol";
import {Address} from "../../../dependencies/openzeppelin/contracts/Address.sol";

/**
 * @title Marketplace library
 *
 * @notice Implements the base logic for all the actions related to NFT buy/accept bid
 */
library MarketplaceLogic {
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using SafeERC20 for IERC20;

    event ReserveUsedAsCollateralDisabled(
        address indexed reserve,
        address indexed user
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
        bool isETH;
        address xTokenAddress;
        address creditToken;
        uint256 creditAmount;
        address weth;
        uint256 ethLeft;
        bytes32 marketplaceId;
        bytes payload;
        DataTypes.Marketplace marketplace;
        DataTypes.OrderInfo orderInfo;
        address seller;
        address buyer;
    }

    function executeBuyWithCredit(
        bytes32 marketplaceId,
        bytes calldata payload,
        DataTypes.Credit calldata credit,
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider,
        uint16 referralCode
    ) external {
        MarketplaceLocalVars memory vars;

        vars.weth = poolAddressProvider.getWETH();
        DataTypes.Marketplace memory marketplace = poolAddressProvider
            .getMarketplace(marketplaceId);
        DataTypes.OrderInfo memory orderInfo = IMarketplace(marketplace.adapter)
            .getAskOrderInfo(payload);
        orderInfo.taker = msg.sender;
        vars.ethLeft = msg.value;

        _depositETH(vars, orderInfo);

        vars.ethLeft -= _buyWithCredit(
            ps,
            DataTypes.ExecuteMarketplaceParams({
                marketplaceId: marketplaceId,
                payload: payload,
                credit: credit,
                ethLeft: vars.ethLeft,
                marketplace: marketplace,
                orderInfo: orderInfo,
                weth: vars.weth,
                referralCode: referralCode,
                reservesCount: ps._reservesCount,
                oracle: poolAddressProvider.getPriceOracle(),
                priceOracleSentinel: poolAddressProvider.getPriceOracleSentinel()
            })
        );

        _refundETH(vars.ethLeft);
    }

    /**
     * @notice Implements the buyWithCredit feature. BuyWithCredit allows users to buy NFT from various NFT marketplaces
     * including OpenSea, LooksRare, X2Y2 etc. Users can use NFT's credit and will need to pay at most (1 - LTV) * $NFT
     * @dev  Emits the `BuyWithCredit()` event
     * @param ps The state of pool storage
     * @param params The additional parameters needed to execute the buyWithCredit function
     */
    function _buyWithCredit(
        DataTypes.PoolStorage storage ps,
        DataTypes.ExecuteMarketplaceParams memory params
    ) internal returns (uint256) {
        ValidationLogic.validateBuyWithCredit(params);

        MarketplaceLocalVars memory vars = _cache(params);
        vars.seller = params.orderInfo.maker;
        vars.buyer = params.orderInfo.taker;

        _borrowTo(ps._reserves, params, vars, address(this));

        (uint256 priceEth, uint256 downpaymentEth) = _delegateToPool(
            params,
            vars
        );

        address[] memory collateralizedNToken = new address[](
            params.orderInfo.offer.length
        );
        _validateERC721ItemAndCollectCollateralizedNToken(
            ps._reserves,
            params,
            collateralizedNToken
        );

        if (collateralizedNToken.length > 0) {
            _setConduit(ps, params.marketplace.operator);
        }

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

        _repayForBuyer(
            ps._reserves,
            ps._reservesList,
            ps._usersConfig[vars.buyer],
            params,
            vars
        );

        _supplyCashForSellerAndValidateHF(
            ps._reserves,
            ps._reservesList,
            ps._usersConfig,
            params,
            vars,
            collateralizedNToken
        );

        if (collateralizedNToken.length > 0) {
            _resetConduit(ps);
        }

        emit BuyWithCredit(
            params.marketplaceId,
            params.orderInfo,
            params.credit
        );

        return downpaymentEth;
    }

    function executeBatchBuyWithCredit(
        bytes32[] calldata marketplaceIds,
        bytes[] calldata payloads,
        DataTypes.Credit[] calldata credits,
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider,
        uint16 referralCode
    ) external {
        MarketplaceLocalVars memory vars;

        vars.weth = poolAddressProvider.getWETH();
        require(
            marketplaceIds.length == payloads.length &&
                payloads.length == credits.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        vars.ethLeft = msg.value;
        for (uint256 i = 0; i < marketplaceIds.length; i++) {
            vars.marketplaceId = marketplaceIds[i];
            vars.payload = payloads[i];
            DataTypes.Credit memory credit = credits[i];

            DataTypes.Marketplace memory marketplace = poolAddressProvider
                .getMarketplace(vars.marketplaceId);
            DataTypes.OrderInfo memory orderInfo = IMarketplace(
                marketplace.adapter
            ).getAskOrderInfo(vars.payload);
            orderInfo.taker = msg.sender;

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
            _depositETH(vars, orderInfo);

            vars.ethLeft -= _buyWithCredit(
                ps,
                DataTypes.ExecuteMarketplaceParams({
                    marketplaceId: vars.marketplaceId,
                    payload: vars.payload,
                    credit: credit,
                    ethLeft: vars.ethLeft,
                    marketplace: marketplace,
                    orderInfo: orderInfo,
                    weth: vars.weth,
                    referralCode: referralCode,
                    reservesCount: ps._reservesCount,
                    oracle: poolAddressProvider.getPriceOracle(),
                    priceOracleSentinel: poolAddressProvider
                        .getPriceOracleSentinel()
                })
            );
        }

        _refundETH(vars.ethLeft);
    }

    function executeAcceptBidWithCredit(
        bytes32 marketplaceId,
        bytes calldata payload,
        DataTypes.Credit calldata credit,
        address onBehalfOf,
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider,
        uint16 referralCode
    ) external {
        MarketplaceLocalVars memory vars;

        vars.weth = poolAddressProvider.getWETH();
        vars.marketplace = poolAddressProvider.getMarketplace(marketplaceId);
        vars.orderInfo = IMarketplace(vars.marketplace.adapter).getBidOrderInfo(
            payload
        );
        require(vars.orderInfo.taker == onBehalfOf, Errors.INVALID_ORDER_TAKER);

        _acceptBidWithCredit(
            ps,
            DataTypes.ExecuteMarketplaceParams({
                marketplaceId: marketplaceId,
                payload: payload,
                credit: credit,
                ethLeft: 0,
                marketplace: vars.marketplace,
                orderInfo: vars.orderInfo,
                weth: vars.weth,
                referralCode: referralCode,
                reservesCount: ps._reservesCount,
                oracle: poolAddressProvider.getPriceOracle(),
                priceOracleSentinel: poolAddressProvider.getPriceOracleSentinel()
            })
        );
    }

    function executeBatchAcceptBidWithCredit(
        bytes32[] calldata marketplaceIds,
        bytes[] calldata payloads,
        DataTypes.Credit[] calldata credits,
        address onBehalfOf,
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider,
        uint16 referralCode
    ) external {
        MarketplaceLocalVars memory vars;

        vars.weth = poolAddressProvider.getWETH();
        require(
            marketplaceIds.length == payloads.length &&
                payloads.length == credits.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        for (uint256 i = 0; i < marketplaceIds.length; i++) {
            vars.marketplaceId = marketplaceIds[i];
            vars.payload = payloads[i];
            DataTypes.Credit memory credit = credits[i];

            vars.marketplace = poolAddressProvider.getMarketplace(
                vars.marketplaceId
            );
            vars.orderInfo = IMarketplace(vars.marketplace.adapter)
                .getBidOrderInfo(vars.payload);
            require(
                vars.orderInfo.taker == onBehalfOf,
                Errors.INVALID_ORDER_TAKER
            );

            _acceptBidWithCredit(
                ps,
                DataTypes.ExecuteMarketplaceParams({
                    marketplaceId: vars.marketplaceId,
                    payload: vars.payload,
                    credit: credit,
                    ethLeft: 0,
                    marketplace: vars.marketplace,
                    orderInfo: vars.orderInfo,
                    weth: vars.weth,
                    referralCode: referralCode,
                    reservesCount: ps._reservesCount,
                    oracle: poolAddressProvider.getPriceOracle(),
                    priceOracleSentinel: poolAddressProvider
                        .getPriceOracleSentinel()
                })
            );
        }
    }

    /**
     * @notice Implements the acceptBidWithCredit feature. AcceptBidWithCredit allows users to
     * accept a leveraged bid on ParaSpace NFT marketplace. Users can submit leveraged bid and pay
     * at most (1 - LTV) * $NFT
     * @dev  Emits the `AcceptBidWithCredit()` event
     * @param ps The state of pool storage
     * @param params The additional parameters needed to execute the acceptBidWithCredit function
     */
    function _acceptBidWithCredit(
        DataTypes.PoolStorage storage ps,
        DataTypes.ExecuteMarketplaceParams memory params
    ) internal {
        ValidationLogic.validateAcceptBidWithCredit(params);

        MarketplaceLocalVars memory vars = _cache(params);
        vars.buyer = params.orderInfo.maker;
        vars.seller = params.orderInfo.taker;

        _borrowTo(ps._reserves, params, vars, vars.buyer);

        address[] memory collateralizedNToken = new address[](
            params.orderInfo.offer.length
        );
        _validateERC721ItemAndCollectCollateralizedNToken(
            ps._reserves,
            params,
            collateralizedNToken
        );

        if (collateralizedNToken.length > 0) {
            _setConduit(ps, params.marketplace.operator);
        }

        // delegateCall to avoid extra token transfer
        Address.functionDelegateCall(
            params.marketplace.adapter,
            abi.encodeWithSelector(
                IMarketplace.matchBidWithTakerAsk.selector,
                params.marketplace.marketplace,
                params.payload
            )
        );

        _repayForBuyer(
            ps._reserves,
            ps._reservesList,
            ps._usersConfig[vars.buyer],
            params,
            vars
        );

        _supplyCashForSellerAndValidateHF(
            ps._reserves,
            ps._reservesList,
            ps._usersConfig,
            params,
            vars,
            collateralizedNToken
        );

        if (collateralizedNToken.length > 0) {
            _resetConduit(ps);
        }

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
        uint256 price = 0;

        for (uint256 i = 0; i < params.orderInfo.consideration.length; i++) {
            ConsiderationItem memory item = params.orderInfo.consideration[i];
            require(
                item.startAmount == item.endAmount,
                Errors.INVALID_MARKETPLACE_ORDER
            );
            require(
                item.itemType == ItemType.ERC20 ||
                    (vars.isETH && item.itemType == ItemType.NATIVE),
                Errors.INVALID_ASSET_TYPE
            );
            require(
                item.token == params.credit.token,
                Errors.CREDIT_DOES_NOT_MATCH_ORDER
            );
            price += item.startAmount;
        }

        uint256 downpayment = price - vars.creditAmount;
        if (!vars.isETH) {
            IERC20(vars.creditToken).safeTransferFrom(
                params.orderInfo.taker,
                address(this),
                downpayment
            );
            _checkAllowance(vars.creditToken, params.marketplace.operator);
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
     * @param reservesData The state of all the reserves
     * @param params The additional parameters needed to execute the buyWithCredit/acceptBidWithCredit function
     * @param vars The marketplace local vars for caching storage values for future reads
     * @param to The receiver of borrowed tokens
     */
    function _borrowTo(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        DataTypes.ExecuteMarketplaceParams memory params,
        MarketplaceLocalVars memory vars,
        address to
    ) internal {
        if (vars.creditAmount == 0) {
            return;
        }

        DataTypes.ReserveData storage reserve = reservesData[vars.creditToken];
        vars.xTokenAddress = reserve.xTokenAddress;

        require(vars.xTokenAddress != address(0), Errors.ASSET_NOT_LISTED);
        ValidationLogic.validateFlashloanSimple(reserve);
        // TODO: support PToken
        IPToken(vars.xTokenAddress).transferUnderlyingTo(to, vars.creditAmount);

        if (vars.isETH) {
            // No re-entrancy because it sent to our contract address
            IWETH(params.weth).withdraw(vars.creditAmount);
        }
    }

    function _validateERC721ItemAndCollectCollateralizedNToken(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        DataTypes.ExecuteMarketplaceParams memory params,
        address[] memory collateralizedNToken
    ) internal view {
        uint256 needCheckCount = 0;
        for (uint256 i = 0; i < params.orderInfo.offer.length; i++) {
            OfferItem memory item = params.orderInfo.offer[i];
            require(
                item.itemType == ItemType.ERC721,
                Errors.INVALID_ASSET_TYPE
            );

            // underlyingAsset
            address token = item.token;
            uint256 tokenId = item.identifierOrCriteria;
            address xTokenAddress = reservesData[token].xTokenAddress;

            // item.token == NToken
            if (xTokenAddress == address(0)) {
                address underlyingAsset = INToken(token)
                    .UNDERLYING_ASSET_ADDRESS();
                bool isNToken = reservesData[underlyingAsset].xTokenAddress ==
                    token;
                require(isNToken, Errors.ASSET_NOT_LISTED);
                xTokenAddress = token;
                item.token = underlyingAsset;
            }

            require(
                INToken(xTokenAddress).getXTokenType() !=
                    XTokenType.NTokenUniswapV3,
                Errors.UNIV3_NOT_ALLOWED
            );

            if (
                ICollateralizableERC721(xTokenAddress).isUsedAsCollateral(
                    tokenId
                )
            ) {
                collateralizedNToken[needCheckCount] = item.token;
                needCheckCount += 1;
            }
        }

        assembly {
            mstore(collateralizedNToken, needCheckCount)
        }
    }

    /**
     * @notice Repay credit.amount by minting debt to the borrower. Borrower's received NFT
     * will also need to be supplied to the pool to provide bigger borrow limit.
     * @dev
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param userConfig The user configuration mapping that tracks the supplied/borrowed assets
     * @param params The additional parameters needed to execute the buyWithCredit/acceptBidWithCredit function
     * @param vars The marketplace local vars for caching storage values for future reads
     */
    function _repayForBuyer(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteMarketplaceParams memory params,
        MarketplaceLocalVars memory vars
    ) internal {
        for (uint256 i = 0; i < params.orderInfo.offer.length; i++) {
            OfferItem memory item = params.orderInfo.offer[i];
            vars.xTokenAddress = reservesData[item.token].xTokenAddress;

            // item.token == underlyingAsset but supplied after listing/offering
            // so NToken is transferred instead
            if (
                INToken(vars.xTokenAddress).ownerOf(
                    item.identifierOrCriteria
                ) == address(this)
            ) {
                _transferAndCollateralize(
                    reservesData,
                    userConfig,
                    vars,
                    item.token,
                    item.identifierOrCriteria,
                    vars.buyer
                );
                // item.token == underlyingAsset and underlyingAsset stays in wallet
            } else {
                DataTypes.ERC721SupplyParams[]
                    memory tokenData = new DataTypes.ERC721SupplyParams[](1);
                tokenData[0] = DataTypes.ERC721SupplyParams(
                    item.identifierOrCriteria,
                    true
                );
                SupplyLogic.executeSupplyERC721(
                    reservesData,
                    userConfig,
                    DataTypes.ExecuteSupplyERC721Params({
                        asset: item.token,
                        tokenData: tokenData,
                        onBehalfOf: vars.buyer,
                        payer: address(this),
                        referralCode: params.referralCode
                    })
                );
            }
        }

        if (vars.creditAmount == 0) {
            return;
        }

        BorrowLogic.executeBorrow(
            reservesData,
            reservesList,
            userConfig,
            DataTypes.ExecuteBorrowParams({
                asset: vars.creditToken,
                user: vars.buyer,
                onBehalfOf: vars.buyer,
                amount: vars.creditAmount,
                referralCode: params.referralCode,
                releaseUnderlying: false,
                reservesCount: params.reservesCount,
                oracle: params.oracle,
                priceOracleSentinel: params.priceOracleSentinel
            })
        );
    }

    function _supplyCashForSellerAndValidateHF(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        mapping(address => DataTypes.UserConfigurationMap) storage userConfig,
        DataTypes.ExecuteMarketplaceParams memory params,
        MarketplaceLocalVars memory vars,
        address[] memory collateralizedNToken
    ) internal {
        if (collateralizedNToken.length == 0) {
            return;
        }

        SupplyLogic.executeSupply(
            reservesData,
            userConfig[vars.seller],
            DataTypes.ExecuteSupplyParams({
                asset: params.orderInfo.consideration[0].token,
                amount: params.orderInfo.consideration[0].startAmount,
                onBehalfOf: vars.seller,
                payer: vars.seller,
                referralCode: params.referralCode
            })
        );

        SupplyLogic.executeUseERC20AsCollateral(
            reservesData,
            reservesList,
            userConfig[vars.seller],
            params.orderInfo.consideration[0].token,
            vars.seller,
            true,
            params.reservesCount,
            params.oracle
        );

        DataTypes.UserConfigurationMap storage sellerConfig = userConfig[
            vars.seller
        ];
        for (uint256 index = 0; index < collateralizedNToken.length; index++) {
            address nft = collateralizedNToken[index];
            DataTypes.ReserveData storage reserve = reservesData[nft];
            bool isUsingAsCollateral = sellerConfig.isUsingAsCollateral(
                reserve.id
            );
            if (isUsingAsCollateral) {
                uint256 collateralizedBalance = ICollateralizableERC721(
                    reserve.xTokenAddress
                ).collateralizedBalanceOf(vars.seller);
                if (collateralizedBalance == 0) {
                    sellerConfig.setUsingAsCollateral(reserve.id, false);
                    emit ReserveUsedAsCollateralDisabled(nft, vars.seller);
                }
            }
        }

        ValidationLogic.validateHealthFactor(
            reservesData,
            reservesList,
            sellerConfig,
            vars.seller,
            params.reservesCount,
            params.oracle
        );
    }

    function _checkAllowance(address token, address operator) internal {
        uint256 allowance = IERC20(token).allowance(address(this), operator);
        if (allowance == 0) {
            IERC20(token).safeApprove(operator, type(uint256).max);
        }
    }

    function _cache(DataTypes.ExecuteMarketplaceParams memory params)
        internal
        pure
        returns (MarketplaceLocalVars memory vars)
    {
        vars.isETH = params.credit.token == address(0);
        vars.creditToken = vars.isETH ? params.weth : params.credit.token;
        vars.creditAmount = params.credit.amount;
    }

    function _refundETH(uint256 ethLeft) internal {
        if (ethLeft > 0) {
            Address.sendValue(payable(msg.sender), ethLeft);
        }
    }

    function _depositETH(
        MarketplaceLocalVars memory vars,
        DataTypes.OrderInfo memory orderInfo
    ) internal {
        if (
            vars.ethLeft > 0 &&
            orderInfo.consideration[0].itemType != ItemType.NATIVE
        ) {
            IWETH(vars.weth).deposit{value: vars.ethLeft}();
            IERC20(vars.weth).safeTransferFrom(
                address(this),
                msg.sender,
                vars.ethLeft
            );
            vars.ethLeft = 0;
        }
    }

    function _transferAndCollateralize(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        DataTypes.UserConfigurationMap storage userConfig,
        MarketplaceLocalVars memory vars,
        address token,
        uint256 tokenId,
        address onBehalfOf
    ) internal {
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;

        IERC721(vars.xTokenAddress).safeTransferFrom(
            address(this),
            onBehalfOf,
            tokenId
        );
        SupplyLogic.executeCollateralizeERC721(
            reservesData,
            userConfig,
            token,
            tokenIds,
            onBehalfOf
        );
    }

    function _setConduit(DataTypes.PoolStorage storage ps, address _conduit)
        internal
    {
        ps._conduit = _conduit;
    }

    function _resetConduit(DataTypes.PoolStorage storage ps) internal {
        ps._conduit = address(0);
    }
}
