// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {IPoolAddressesProvider} from "./IPoolAddressesProvider.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

/**
 * @title IPoolBlurIntegration
 *
 * @notice Defines the basic interface for an ParaSpace Pool.
 **/
interface IPoolBlurIntegration {
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
