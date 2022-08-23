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
import {GPv2SafeERC20} from "../../../dependencies/gnosis/contracts/GPv2SafeERC20.sol";
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
    using GPv2SafeERC20 for IERC20;

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
    ) external {
        ValidationLogic.validateBuyWithCredit(params);

        _borrowTo(
            reservesData,
            reservesList,
            userConfig,
            params,
            address(this)
        );

        uint256 value = _delegateToPool(
            reservesData,
            reservesList,
            userConfig,
            params
        );

        // delegateCall to avoid extra token transfer
        Address.functionDelegateCall(
            params.marketplace.adapter,
            abi.encodeWithSelector(
                IMarketplace.matchAskWithTakerBid.selector,
                params.marketplace.marketplace,
                params.data,
                value
            )
        );

        _repay(
            reservesData,
            reservesList,
            userConfig,
            params,
            params.orderInfo.taker
        );

        emit BuyWithCredit(
            params.marketplaceId,
            params.orderInfo,
            params.credit
        );
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

        _borrowTo(
            reservesData,
            reservesList,
            userConfig,
            params,
            params.orderInfo.maker
        );

        // delegateCall to avoid extra token transfer
        Address.functionDelegateCall(
            params.marketplace.adapter,
            abi.encodeWithSelector(
                IMarketplace.matchBidWithTakerAsk.selector,
                params.marketplace.marketplace,
                params.data
            )
        );

        _repay(
            reservesData,
            reservesList,
            userConfig,
            params,
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
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param userConfig The user configuration mapping that tracks the supplied/borrowed assets
     * @param params The additional parameters needed to execute the buyWithCredit/acceptBidWithCredit function
     */
    function _delegateToPool(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteMarketplaceParams memory params
    ) internal returns (uint256) {
        address token = params.credit.token;
        uint256 value = 0;
        bool isETH = token == address(0);

        for (uint256 i = 0; i < params.orderInfo.consideration.length; i++) {
            ConsiderationItem memory item = params.orderInfo.consideration[i];
            require(
                item.startAmount == item.endAmount,
                Errors.INVALID_MARKETPLACE_ORDER
            );
            require(
                item.itemType == ItemType.ERC20 ||
                    (isETH && item.itemType == ItemType.NATIVE),
                Errors.INVALID_ASSET_TYPE
            );
            require(item.token == token, Errors.CREDIT_DOES_NOT_MATCH_ORDER);
            value += item.startAmount;
        }

        uint256 payNow = value - params.credit.amount;
        if (!isETH) {
            IERC20(token).safeTransferFrom(msg.sender, address(this), payNow);
            // reset to be compatible with USDT
            IERC20(token).approve(params.marketplace.operator, 0);
            IERC20(token).approve(params.marketplace.operator, value);
            value = 0;
        } else {
            require(msg.value == payNow, Errors.PAYNOW_NOT_ENOUGH);
            params.credit.token = params.WETH;
        }

        return value;
    }

    /**
     * @notice Borrow credit.amount from `credit.token` reserve without collateral. The corresponding
     * debt will be minted in the same block to the borrower.
     * @dev
     * @param reservesData The state of all the reserves
     * @param reservesList The addresses of all the active reserves
     * @param userConfig The user configuration mapping that tracks the supplied/borrowed assets
     * @param params The additional parameters needed to execute the buyWithCredit/acceptBidWithCredit function
     * @param to The receiver of borrowed tokens
     */
    function _borrowTo(
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.ExecuteMarketplaceParams memory params,
        address to
    ) internal {
        bool isETH = params.credit.token == address(0);
        address underlyingAsset = params.credit.token;
        if (isETH) {
            underlyingAsset = params.WETH;
        }

        DataTypes.ReserveData storage reserve = reservesData[underlyingAsset];

        require(reserve.xTokenAddress != address(0), Errors.ASSET_NOT_LISTED);
        ValidationLogic.validateFlashloanSimple(reserve);
        IPToken(reserve.xTokenAddress).transferUnderlyingTo(
            to,
            params.credit.amount
        );

        if (isETH) {
            // No re-entrancy because it sent to our contract address
            IWETH(params.WETH).withdraw(params.credit.amount);
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
            DataTypes.ReserveData memory reserve = reservesData[token];

            if (reserve.xTokenAddress == address(0)) {
                address underlyingAsset = INToken(token)
                    .UNDERLYING_ASSET_ADDRESS();
                reserve = reservesData[underlyingAsset];
                bool isNToken = reserve.xTokenAddress == token;

                require(isNToken, Errors.ASSET_NOT_LISTED);
                userConfig.setUsingAsCollateral(reserve.id, true);
                // No need to supply anymore because it's already NToken
                continue;
            }

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

        BorrowLogic.executeBorrow(
            reservesData,
            reservesList,
            userConfig,
            DataTypes.ExecuteBorrowParams({
                asset: params.credit.token,
                user: onBehalfOf,
                onBehalfOf: onBehalfOf,
                amount: params.credit.amount,
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
}
