// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./clearinghouse/IClearinghouse.sol";
import "./IFeeCalculator.sol";
import "./IVersion.sol";

interface IOffchainBook is IVersion {
    event FillOrder(
        // original order information
        bytes32 indexed digest,
        bytes32 indexed subaccount,
        int128 priceX18,
        int128 amount,
        uint64 expiration,
        uint64 nonce,
        // whether this order is taking or making
        bool isTaker,
        // amount paid in fees (in quote)
        int128 feeAmount,
        // change in this subaccount's base balance from this fill
        int128 baseDelta,
        // change in this subaccount's quote balance from this fill
        int128 quoteDelta
    );

    struct Market {
        uint32 productId;
        int128 sizeIncrement;
        int128 priceIncrementX18;
        int128 lpSpreadX18;
        int128 collectedFees;
        int128 sequencerFees;
    }

    function initialize(
        IClearinghouse _clearinghouse,
        IProductEngine _engine,
        address _endpoint,
        address _admin,
        IFeeCalculator _fees,
        uint32 _productId,
        int128 _sizeIncrement,
        int128 _priceIncrementX18,
        int128 _minSize,
        int128 _lpSpreadX18
    ) external;

    function modifyConfig(
        int128 _sizeIncrement,
        int128 _priceIncrementX18,
        int128 _minSize,
        int128 _lpSpreadX18
    ) external;

    function getMinSize() external view returns (int128);

    function getDigest(IEndpoint.Order memory order)
        external
        view
        returns (bytes32);

    function getMarket() external view returns (Market memory);

    function swapAMM(IEndpoint.SwapAMM calldata tx) external;

    function matchOrderAMM(
        IEndpoint.MatchOrderAMM calldata tx,
        address takerLinkedSigner
    ) external;

    function matchOrders(IEndpoint.MatchOrdersWithSigner calldata tx) external;

    function dumpFees() external;

    function claimSequencerFee() external returns (int128);
}
