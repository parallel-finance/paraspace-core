// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

interface IClearinghouseEventEmitter {
    /// @notice Emitted during initialization
    event ClearinghouseInitialized(
        address endpoint,
        address quote,
        address fees
    );

    /// @notice Emitted when collateral is modified for a subaccount
    event ModifyCollateral(
        int128 amount,
        bytes32 indexed subaccount,
        uint32 productId
    );

    event Liquidation(
        bytes32 indexed liquidatorSubaccount,
        bytes32 indexed liquidateeSubaccount,
        uint8 indexed mode,
        uint32 healthGroup,
        int128 amount,
        int128 amountQuote,
        int128 insuranceCover
    );
}
