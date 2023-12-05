// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./IProductEngine.sol";
import "../clearinghouse/IClearinghouseState.sol";

interface IPerpEngine is IProductEngine {
    struct State {
        int128 cumulativeFundingLongX18;
        int128 cumulativeFundingShortX18;
        int128 availableSettle;
        int128 openInterest;
    }

    struct Balance {
        int128 amount;
        int128 vQuoteBalance;
        int128 lastCumulativeFundingX18;
    }

    struct LpState {
        int128 supply;
        // TODO: this should be removed; we can just get it from State.cumulativeFundingLongX18
        int128 lastCumulativeFundingX18;
        int128 cumulativeFundingPerLpX18;
        int128 base;
        int128 quote;
    }

    struct LpBalance {
        int128 amount;
        // NOTE: funding payments should be rolled
        // into Balance.vQuoteBalance;
        int128 lastCumulativeFundingX18;
    }

    struct UpdateProductTx {
        uint32 productId;
        int128 sizeIncrement;
        int128 priceIncrementX18;
        int128 minSize;
        int128 lpSpreadX18;
        IClearinghouseState.RiskStore riskStore;
    }

    function getStateAndBalance(uint32 productId, bytes32 subaccount)
        external
        view
        returns (State memory, Balance memory);

    function getBalance(uint32 productId, bytes32 subaccount)
        external
        view
        returns (Balance memory);

    function hasBalance(uint32 productId, bytes32 subaccount)
        external
        view
        returns (bool);

    function getStatesAndBalances(uint32 productId, bytes32 subaccount)
        external
        view
        returns (
            LpState memory,
            LpBalance memory,
            State memory,
            Balance memory
        );

    function getBalances(uint32 productId, bytes32 subaccount)
        external
        view
        returns (LpBalance memory, Balance memory);

    function getLpState(uint32 productId)
        external
        view
        returns (LpState memory);

    /// @dev Returns amount settled and emits SettlePnl events for each product
    function settlePnl(bytes32 subaccount, uint256 productIds)
        external
        returns (int128);

    function getSettlementState(uint32 productId, bytes32 subaccount)
        external
        view
        returns (
            int128 availableSettle,
            LpState memory lpState,
            LpBalance memory lpBalance,
            State memory state,
            Balance memory balance
        );

    function updateStates(uint128 dt, int128[] calldata avgPriceDiffs) external;

    function manualAssert(int128[] calldata openInterests) external view;

    function getPositionPnl(uint32 productId, bytes32 subaccount)
        external
        view
        returns (int128);

    function socializeSubaccount(bytes32 subaccount, int128 insurance)
        external
        returns (int128);
}
