// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import {IPoolAddressesProvider} from "./IPoolAddressesProvider.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

/**
 * @title IPoolMarketplace
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
     * @dev Emitted on initiateBlurExchangeRequest()
     * @param initiator The address of initiator of the request
     * @param paymentToken The address of paymentToken of the request
     * @param listingPrice The listing price of the request
     * @param borrowAmount The borrow amount for the request
     * @param collection the collection address of the erc721
     * @param tokenId the tokenId address of the erc721
     **/
    event BlurExchangeRequestInitiated(
        address indexed initiator,
        address paymentToken,
        uint256 listingPrice,
        uint256 borrowAmount,
        address collection,
        uint256 tokenId
    );

    /**
     * @dev Emitted on fulfillBlurExchangeRequest()
     * @param initiator The address of initiator of the request
     * @param paymentToken The address of paymentToken of the request
     * @param listingPrice The listing price of the request
     * @param borrowAmount The borrow amount for the request
     * @param collection the collection address of the erc721
     * @param tokenId the tokenId address of the erc721
     **/
    event BlurExchangeRequestFulfilled(
        address indexed initiator,
        address paymentToken,
        uint256 listingPrice,
        uint256 borrowAmount,
        address collection,
        uint256 tokenId
    );

    /**
     * @dev Emitted on rejectBlurExchangeRequest()
     * @param initiator The address of initiator of the request
     * @param paymentToken The address of paymentToken of the request
     * @param listingPrice The listing price of the request
     * @param borrowAmount The borrow amount for the request
     * @param collection the collection address of the erc721
     * @param tokenId the tokenId address of the erc721
     **/
    event BlurExchangeRequestRejected(
        address indexed initiator,
        address paymentToken,
        uint256 listingPrice,
        uint256 borrowAmount,
        address collection,
        uint256 tokenId
    );

    /**
     * @dev Emitted on initiateAcceptBlurBidsRequest()
     * @param initiator The address of initiator of the request
     * @param paymentToken The address of paymentToken of the request
     * @param bidingPrice The listing price of the request
     * @param marketPlaceFee The market place fee taken from bidingPrice
     * @param collection the collection address of the erc721
     * @param tokenId the tokenId address of the erc721
     * @param bidOrderHash the biding order hash
     **/
    event AcceptBlurBidsRequestInitiated(
        address indexed initiator,
        address paymentToken,
        uint256 bidingPrice,
        uint256 marketPlaceFee,
        address collection,
        uint256 tokenId,
        bytes32 bidOrderHash
    );

    /**
     * @dev Emitted on fulfillAcceptBlurBidsRequest()
     * @param initiator The address of initiator of the request
     * @param paymentToken The address of paymentToken of the request
     * @param bidingPrice The listing price of the request
     * @param marketPlaceFee The market place fee taken from bidingPrice
     * @param collection the collection address of the erc721
     * @param tokenId the tokenId address of the erc721
     * @param bidOrderHash the biding order hash
     **/
    event AcceptBlurBidsRequestFulfilled(
        address indexed initiator,
        address paymentToken,
        uint256 bidingPrice,
        uint256 marketPlaceFee,
        address collection,
        uint256 tokenId,
        bytes32 bidOrderHash
    );

    /**
     * @dev Emitted on rejectAcceptBlurBidsRequest()
     * @param initiator The address of initiator of the request
     * @param paymentToken The address of paymentToken of the request
     * @param bidingPrice The listing price of the request
     * @param marketPlaceFee The market place fee taken from bidingPrice
     * @param collection the collection address of the erc721
     * @param tokenId the tokenId address of the erc721
     * @param bidOrderHash the biding order hash
     **/
    event AcceptBlurBidsRequestRejected(
        address indexed initiator,
        address paymentToken,
        uint256 bidingPrice,
        uint256 marketPlaceFee,
        address collection,
        uint256 tokenId,
        bytes32 bidOrderHash
    );

    /**
     * @notice Implements the buyWithCredit feature. BuyWithCredit allows users to buy NFT from various NFT marketplaces
     * including OpenSea, LooksRare, X2Y2 etc. Users can use NFT's credit and will need to pay at most (1 - LTV) * $NFT
     * @dev
     * @param marketplaceId The marketplace identifier
     * @param payload The encoded parameters to be passed to marketplace contract (selector eliminated)
     * @param credit The credit that user would like to use for this purchase
     * @param referralCode The referral code used
     */
    function buyWithCredit(
        bytes32 marketplaceId,
        bytes calldata payload,
        DataTypes.Credit calldata credit,
        uint16 referralCode
    ) external payable;

    /**
     * @notice Implements the batchBuyWithCredit feature. BuyWithCredit allows users to buy NFT from various NFT marketplaces
     * including OpenSea, LooksRare, X2Y2 etc. Users can use NFT's credit and will need to pay at most (1 - LTV) * $NFT
     * @dev marketplaceIds[i] should match payload[i] and credits[i]
     * @param marketplaceIds The marketplace identifiers
     * @param payloads The encoded parameters to be passed to marketplace contract (selector eliminated)
     * @param credits The credits that user would like to use for this purchase
     * @param referralCode The referral code used
     */
    function batchBuyWithCredit(
        bytes32[] calldata marketplaceIds,
        bytes[] calldata payloads,
        DataTypes.Credit[] calldata credits,
        uint16 referralCode
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
     * @param referralCode The referral code used
     */
    function acceptBidWithCredit(
        bytes32 marketplaceId,
        bytes calldata payload,
        DataTypes.Credit calldata credit,
        address onBehalfOf,
        uint16 referralCode
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
     * @param referralCode The referral code used
     */
    function batchAcceptBidWithCredit(
        bytes32[] calldata marketplaceIds,
        bytes[] calldata payloads,
        DataTypes.Credit[] calldata credits,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /**
     * @notice Initiate a buyWithCredit request for Blur exchange listing order.
     * @dev Only the request initiator can call this function
     * @param requests The request array
     */
    function initiateBlurExchangeRequest(
        DataTypes.BlurBuyWithCreditRequest[] calldata requests
    ) external payable;

    /**
     * @notice Fulfill a buyWithCredit request for Blur exchange listing order if the blur transaction is successes.
     * @dev Only keeper can call this function
     * @param requests The request array
     */
    function fulfillBlurExchangeRequest(
        DataTypes.BlurBuyWithCreditRequest[] calldata requests
    ) external;

    /**
     * @notice Reject a buyWithCredit request for Blur exchange listing order if the blur transaction is failed.
     * @dev Only keeper can call this function
     * @param requests The request array
     */
    function rejectBlurExchangeRequest(
        DataTypes.BlurBuyWithCreditRequest[] calldata requests
    ) external payable;

    /**
     * @notice Get a buyWithCredit request status for Blur exchange listing order.
     */
    function getBlurExchangeRequestStatus(
        DataTypes.BlurBuyWithCreditRequest calldata request
    ) external view returns (DataTypes.BlurBuyWithCreditRequestStatus);

    /**
     * @notice Initiate accept blur bids for underlying request.
     * @dev Only the request initiator can call this function
     * @param requests The request array
     */
    function initiateAcceptBlurBidsRequest(
        DataTypes.AcceptBlurBidsRequest[] calldata requests
    ) external payable;

    /**
     * @notice Fulfill accept blur bids for underlying request if the blur selling transaction is successes.
     * @dev Only keeper can call this function
     * @param requests The request array
     */
    function fulfillAcceptBlurBidsRequest(
        DataTypes.AcceptBlurBidsRequest[] calldata requests
    ) external payable;

    /**
     * @notice Reject accept blur bids for underlying request if the blur selling transaction is failed.
     * @dev Only keeper can call this function
     * @param requests The request array
     */
    function rejectAcceptBlurBidsRequest(
        DataTypes.AcceptBlurBidsRequest[] calldata requests
    ) external;

    /**
     * @notice Get a accept blur bids for underlying request status.
     */
    function getAcceptBlurBidsRequestStatus(
        DataTypes.AcceptBlurBidsRequest calldata request
    ) external view returns (DataTypes.AcceptBlurBidsRequestStatus);
}
