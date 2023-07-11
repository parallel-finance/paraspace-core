// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import {IPoolAddressesProvider} from "./IPoolAddressesProvider.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

/**
 * @title IPool
 *
 * @notice Defines the basic interface for an ParaSpace Pool.
 **/
interface IPoolMarketplace {
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
     * @dev
     * @param marketplaceId The marketplace identifier
     * @param payload The encoded parameters to be passed to marketplace contract (selector eliminated)
     * @param credit The credit that user would like to use for this purchase
     */
    function buyWithCredit(
        bytes32 marketplaceId,
        bytes calldata payload,
        DataTypes.Credit calldata credit
    ) external payable;

    /**
     * @notice Purchase an asset through a specified marketplace using the user's available credit.
     * @dev The credit must have been previously approved for use by the user, and the marketplace must support the `marketplaceId`.
     * @dev The payment for the asset is deducted from the user's available credit, and any remaining credit is returned to the user.
     * @dev The purchase is executed using the `swapAdapterId` and `swapPayload` parameters to identify the specific adapter and its configuration.
     * @param marketplaceId The ID of the marketplace to purchase the asset from.
     * @param payload Additional data to be passed to the marketplace to configure the purchase.
     * @param credit A `DataTypes.Credit` struct specifying the credit to be used for the purchase.
     * @param swapAdapterId The ID of the adapter to be used for the swap.
     * @param swapPayload Additional data to be passed to the adapter to configure the swap.
     */
    function buyAnyWithCredit(
        bytes32 marketplaceId,
        bytes calldata payload,
        DataTypes.Credit calldata credit,
        bytes32 swapAdapterId,
        bytes calldata swapPayload
    ) external payable;

    /**
     * @notice Implements the batchBuyWithCredit feature. BuyWithCredit allows users to buy NFT from various NFT marketplaces
     * including OpenSea, LooksRare, X2Y2 etc. Users can use NFT's credit and will need to pay at most (1 - LTV) * $NFT
     * @dev marketplaceIds[i] should match payload[i] and credits[i]
     * @param marketplaceIds The marketplace identifiers
     * @param payloads The encoded parameters to be passed to marketplace contract (selector eliminated)
     * @param credits The credits that user would like to use for this purchase
     */
    function batchBuyWithCredit(
        bytes32[] calldata marketplaceIds,
        bytes[] calldata payloads,
        DataTypes.Credit[] calldata credits
    ) external payable;

    /**
     * @notice Purchase multiple assets through multiple marketplaces using the user's available credit.
     * @dev The credit must have been previously approved for use by the user, and the marketplaces must support the specified `marketplaceIds`.
     * @dev The payment for each asset is deducted from the user's available credit, and any remaining credit is returned to the user.
     * @dev The purchase for each asset is executed using the corresponding `swapAdapters` and `swapPayloads` in the same order as the `marketplaceIds`.
     * @param marketplaceIds An array of marketplace IDs to purchase assets from.
     * @param payloads An array of additional data to be passed to each marketplace to configure the respective purchases.
     * @param credits An array of `DataTypes.Credit` structs specifying the credits to be used for each purchase.
     * @param swapAdapters An array of `DataTypes.SwapAdapter` structs specifying the adapter to be used for each purchase.
     * @param swapPayloads An array of additional data to be passed to each adapter to configure the respective swaps.
     */
    function batchBuyAnyWithCredit(
        bytes32[] calldata marketplaceIds,
        bytes[] calldata payloads,
        DataTypes.Credit[] calldata credits,
        DataTypes.SwapAdapter[] calldata swapAdapters,
        bytes[] calldata swapPayloads
    ) external payable;

    /**
     * @notice Implements the acceptBidWithCredit feature. AcceptBidWithCredit allows users to
     * accept a leveraged bid on ParaSpace NFT marketplace. Users can submit leveraged bid and pay
     * at most (1 - LTV) * $NFT
     * @dev The nft receiver just needs to do the downpayment
     * @param marketplaceId The marketplace identifier
     * @param payload The encoded parameters to be passed to marketplace contract (selector eliminated)
     * @param credit The credit that user would like to use for this purchase
     * @param onBehalfOf Address of the user who will sell the NFT
     */
    function acceptBidWithCredit(
        bytes32 marketplaceId,
        bytes calldata payload,
        DataTypes.Credit calldata credit,
        address onBehalfOf
    ) external;

    /**
     * @notice Implements the batchAcceptBidWithCredit feature. AcceptBidWithCredit allows users to
     * accept a leveraged bid on ParaSpace NFT marketplace. Users can submit leveraged bid and pay
     * at most (1 - LTV) * $NFT
     * @dev The nft receiver just needs to do the downpayment
     * @param marketplaceIds The marketplace identifiers
     * @param payloads The encoded parameters to be passed to marketplace contract (selector eliminated)
     * @param credits The credits that the makers have approved to use for this purchase
     * @param onBehalfOf Address of the user who will sell the NFTs
     */
    function batchAcceptBidWithCredit(
        bytes32[] calldata marketplaceIds,
        bytes[] calldata payloads,
        DataTypes.Credit[] calldata credits,
        address onBehalfOf
    ) external;

    /**
     * @notice Accepts an OpenSea bid
     * @param marketplaceId The unique identifier of the marketplace where the bid is made
     * @param payload The bytes data of the bid payload
     * @param onBehalfOf The address of the account (the bidder, or the seller with the OpenSea account authorized) that will execute the transaction
     */
    function acceptOpenseaBid(
        bytes32 marketplaceId,
        bytes calldata payload,
        address onBehalfOf
    ) external;

    /**
     * @notice Batch accepts OpenSea bids
     * @param marketplaceIds The unique identifiers of the marketplace where the bid is made
     * @param payloads The bytes data of the bid payloads
     * @param onBehalfOf The address of the account (the bidder, or the seller with the OpenSea account authorized) that will execute the transaction
     */
    function batchAcceptOpenseaBid(
        bytes32[] calldata marketplaceIds,
        bytes[] calldata payloads,
        address onBehalfOf
    ) external;
}
