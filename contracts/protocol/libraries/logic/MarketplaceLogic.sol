// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IERC721} from "../../../dependencies/openzeppelin/contracts/IERC721.sol";
import {INToken} from "../../../interfaces/INToken.sol";
import {ICollaterizableERC721} from "../../../interfaces/ICollaterizableERC721.sol";
import {DataTypes} from "../types/DataTypes.sol";
import {IPToken} from "../../../interfaces/IPToken.sol";
import {Errors} from "../helpers/Errors.sol";
import {ValidationLogic} from "./ValidationLogic.sol";
import {SupplyLogic} from "./SupplyLogic.sol";
import {BorrowLogic} from "./BorrowLogic.sol";
import {SeaportInterface} from "../../../dependencies/seaport/contracts/interfaces/SeaportInterface.sol";
import {SafeERC20} from "../../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";
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
    }

    /**
     * @notice Implements the buyWithCredit feature. BuyWithCredit allows users to buy NFT from various NFT marketplaces
     * including OpenSea, LooksRare, X2Y2 etc. Users can use NFT's credit and will need to pay at most (1 - LTV) * $NFT
     * @dev  Emits the `BuyWithCredit()` event
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param userConfig The user configuration mapping that tracks the supplied/borrowed assets
     * @param params The additional parameters needed to execute the buyWithCredit function
     */
    function executeBuyWithCredit(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteMarketplaceParams memory params
    ) external returns (uint256) {
        ValidationLogic.validateBuyWithCredit(params);

        MarketplaceLocalVars memory vars = _cache(params);

        _borrowTo(reservesData, params, vars, address(this));

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

        _repay(
            reservesData,
            reservesList,
            userConfig,
            params,
            vars,
            params.orderInfo.taker
        );

        emit BuyWithCredit(
            params.marketplaceId,
            params.orderInfo,
            params.credit
        );

        return downpaymentEth;
    }

    /**
     * @notice Implements the acceptBidWithCredit feature. AcceptBidWithCredit allows users to
     * accept a leveraged bid on ParaSpace NFT marketplace. Users can submit leveraged bid and pay
     * at most (1 - LTV) * $NFT
     * @dev  Emits the `AcceptBidWithCredit()` event
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param userConfig The user configuration mapping that tracks the supplied/borrowed assets
     * @param params The additional parameters needed to execute the acceptBidWithCredit function
     */
    function executeAcceptBidWithCredit(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteMarketplaceParams memory params
    ) external {
        ValidationLogic.validateAcceptBidWithCredit(params);

        MarketplaceLocalVars memory vars = _cache(params);

        _borrowTo(reservesData, params, vars, params.orderInfo.maker);

        // delegateCall to avoid extra token transfer
        Address.functionDelegateCall(
            params.marketplace.adapter,
            abi.encodeWithSelector(
                IMarketplace.matchBidWithTakerAsk.selector,
                params.marketplace.marketplace,
                params.payload
            )
        );

        _repay(
            reservesData,
            reservesList,
            userConfig,
            params,
            vars,
            params.orderInfo.maker
        );

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
        IPToken(vars.xTokenAddress).transferUnderlyingTo(to, vars.creditAmount);

        if (vars.isETH) {
            // No re-entrancy because it sent to our contract address
            IWETH(params.weth).withdraw(vars.creditAmount);
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
     * @param onBehalfOf The receiver of minted debt and NToken
     */
    function _repay(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteMarketplaceParams memory params,
        MarketplaceLocalVars memory vars,
        address onBehalfOf
    ) internal {
        for (uint256 i = 0; i < params.orderInfo.offer.length; i++) {
            OfferItem memory item = params.orderInfo.offer[i];
            require(
                item.itemType == ItemType.ERC721,
                Errors.INVALID_ASSET_TYPE
            );

            address token = item.token;
            uint256 tokenId = item.identifierOrCriteria;
            uint256[] memory tokenIds = new uint256[](1);
            tokenIds[0] = tokenId;
            vars.xTokenAddress = reservesData[token].xTokenAddress;

            // item.token == NToken
            if (vars.xTokenAddress == address(0)) {
                address underlyingAsset = INToken(token)
                    .UNDERLYING_ASSET_ADDRESS();
                bool isNToken = reservesData[underlyingAsset].xTokenAddress ==
                    token;
                require(isNToken, Errors.ASSET_NOT_LISTED);
                SupplyLogic.executeCollateralizeERC721(
                    reservesData,
                    userConfig,
                    underlyingAsset,
                    tokenIds,
                    onBehalfOf
                );
                // No need to supply anymore because it's already NToken
                continue;
            }

            // item.token == underlyingAsset but supplied after listing/offering
            if (INToken(vars.xTokenAddress).ownerOf(tokenId) == onBehalfOf) {
                SupplyLogic.executeCollateralizeERC721(
                    reservesData,
                    userConfig,
                    token,
                    tokenIds,
                    onBehalfOf
                );
                continue;
            }

            // item.token == underlyingAsset and underlyingAsset stays in wallet
            DataTypes.ERC721SupplyParams[]
                memory tokenData = new DataTypes.ERC721SupplyParams[](1);
            tokenData[0] = DataTypes.ERC721SupplyParams(tokenId, true);
            SupplyLogic.executeSupplyERC721(
                reservesData,
                userConfig,
                DataTypes.ExecuteSupplyERC721Params({
                    asset: token,
                    tokenData: tokenData,
                    onBehalfOf: onBehalfOf,
                    actualSpender: address(this),
                    referralCode: params.referralCode
                })
            );
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
                user: onBehalfOf,
                onBehalfOf: onBehalfOf,
                amount: vars.creditAmount,
                interestRateMode: DataTypes.InterestRateMode(
                    DataTypes.InterestRateMode.VARIABLE
                ),
                referralCode: params.referralCode,
                releaseUnderlying: false,
                maxStableRateBorrowSizePercent: params
                    .maxStableRateBorrowSizePercent,
                reservesCount: params.reservesCount,
                oracle: params.oracle,
                priceOracleSentinel: params.priceOracleSentinel
            })
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

    function refundETH(uint256 ethLeft) external {
        if (ethLeft > 0) {
            Address.sendValue(payable(msg.sender), ethLeft);
        }
    }

    function depositETH(address weth, uint256 ethLeft) external {
        IWETH(weth).deposit{value: ethLeft}();
        IERC20(weth).safeTransferFrom(address(this), msg.sender, ethLeft);
    }
}
