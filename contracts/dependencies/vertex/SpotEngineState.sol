// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./interfaces/engine/ISpotEngine.sol";
import "./BaseEngine.sol";

abstract contract SpotEngineState is ISpotEngine, BaseEngine {
    using MathSD21x18 for int128;

    mapping(uint32 => Config) internal configs;
    mapping(uint32 => State) public states;
    mapping(uint32 => mapping(bytes32 => Balances)) public balances;

    mapping(uint32 => LpState) public lpStates;

    mapping(uint32 => int128) public withdrawFees;

    function _updateBalanceWithoutDelta(
        State memory state,
        Balance memory balance
    ) internal pure {
        if (balance.amount == 0) {
            balance.lastCumulativeMultiplierX18 = state
                .cumulativeDepositsMultiplierX18;
            return;
        }

        // Current cumulative multiplier associated with product
        int128 cumulativeMultiplierX18;
        if (balance.amount > 0) {
            cumulativeMultiplierX18 = state.cumulativeDepositsMultiplierX18;
        } else {
            cumulativeMultiplierX18 = state.cumulativeBorrowsMultiplierX18;
        }

        if (balance.lastCumulativeMultiplierX18 == cumulativeMultiplierX18) {
            return;
        }

        balance.amount = balance.amount.mul(cumulativeMultiplierX18).div(
            balance.lastCumulativeMultiplierX18
        );

        balance.lastCumulativeMultiplierX18 = cumulativeMultiplierX18;
    }

    function _updateBalance(
        State memory state,
        Balance memory balance,
        int128 balanceDelta
    ) internal pure {
        if (balance.amount == 0 && balance.lastCumulativeMultiplierX18 == 0) {
            balance.lastCumulativeMultiplierX18 = ONE;
        }

        if (balance.amount > 0) {
            state.totalDepositsNormalized -= balance.amount.div(
                balance.lastCumulativeMultiplierX18
            );
        } else {
            state.totalBorrowsNormalized += balance.amount.div(
                balance.lastCumulativeMultiplierX18
            );
        }

        // Current cumulative multiplier associated with product
        int128 cumulativeMultiplierX18;
        if (balance.amount > 0) {
            cumulativeMultiplierX18 = state.cumulativeDepositsMultiplierX18;
        } else {
            cumulativeMultiplierX18 = state.cumulativeBorrowsMultiplierX18;
        }

        // Apply balance delta and interest rate
        balance.amount =
            balance.amount.mul(
                cumulativeMultiplierX18.div(balance.lastCumulativeMultiplierX18)
            ) +
            balanceDelta;

        if (balance.amount > 0) {
            cumulativeMultiplierX18 = state.cumulativeDepositsMultiplierX18;
        } else {
            cumulativeMultiplierX18 = state.cumulativeBorrowsMultiplierX18;
        }

        balance.lastCumulativeMultiplierX18 = cumulativeMultiplierX18;

        // Update the product given balanceDelta
        if (balance.amount > 0) {
            state.totalDepositsNormalized += balance.amount.div(
                balance.lastCumulativeMultiplierX18
            );
        } else {
            state.totalBorrowsNormalized -= balance.amount.div(
                balance.lastCumulativeMultiplierX18
            );
        }
    }

    function _updateBalanceNormalized(
        State memory state,
        BalanceNormalized memory balance,
        int128 balanceDelta
    ) internal pure {
        if (balance.amountNormalized > 0) {
            state.totalDepositsNormalized -= balance.amountNormalized;
        } else {
            state.totalBorrowsNormalized += balance.amountNormalized;
        }

        // Current cumulative multiplier associated with product
        int128 cumulativeMultiplierX18;
        if (balance.amountNormalized > 0) {
            cumulativeMultiplierX18 = state.cumulativeDepositsMultiplierX18;
        } else {
            cumulativeMultiplierX18 = state.cumulativeBorrowsMultiplierX18;
        }

        int128 newAmount = balance.amountNormalized.mul(
            cumulativeMultiplierX18
        ) + balanceDelta;

        if (newAmount > 0) {
            cumulativeMultiplierX18 = state.cumulativeDepositsMultiplierX18;
        } else {
            cumulativeMultiplierX18 = state.cumulativeBorrowsMultiplierX18;
        }

        balance.amountNormalized = newAmount.div(cumulativeMultiplierX18);

        // Update the product given balanceDelta
        if (balance.amountNormalized > 0) {
            state.totalDepositsNormalized += balance.amountNormalized;
        } else {
            state.totalBorrowsNormalized -= balance.amountNormalized;
        }
    }

    function _updateState(
        uint32 productId,
        State memory state,
        uint128 dt
    ) internal {
        int128 utilizationRatioX18;
        int128 totalDeposits = state.totalDepositsNormalized.mul(
            state.cumulativeDepositsMultiplierX18
        );

        {
            int128 totalBorrows = state.totalBorrowsNormalized.mul(
                state.cumulativeBorrowsMultiplierX18
            );
            utilizationRatioX18 = totalDeposits == 0
                ? int128(0)
                : totalBorrows.div(totalDeposits);
        }

        int128 borrowRateMultiplierX18;
        {
            Config memory config = configs[productId];

            // annualized borrower rate
            int128 borrowerRateX18 = config.interestFloorX18;
            if (utilizationRatioX18 == 0) {
                // setting borrowerRateX18 to 0 here has the property that
                // adding a product at the beginning of time and not using it until time T
                // results in the same state as adding the product at time T
                borrowerRateX18 = 0;
            } else if (utilizationRatioX18 < config.interestInflectionUtilX18) {
                borrowerRateX18 += config
                    .interestSmallCapX18
                    .mul(utilizationRatioX18)
                    .div(config.interestInflectionUtilX18);
            } else {
                borrowerRateX18 +=
                    config.interestSmallCapX18 +
                    config.interestLargeCapX18.mul(
                        (
                            (utilizationRatioX18 -
                                config.interestInflectionUtilX18).div(
                                    ONE - config.interestInflectionUtilX18
                                )
                        )
                    );
            }

            // convert to per second
            borrowerRateX18 = borrowerRateX18.div(
                MathSD21x18.fromInt(31536000)
            );
            borrowRateMultiplierX18 = (ONE + borrowerRateX18).pow(int128(dt));
        }

        // if we don't take fees into account, the liquidity, which is
        // (deposits - borrows) should remain the same after updating state.

        // For simplicity, we use `tb`, `cbm`, `td`, and `cdm` for
        // `totalBorrowsNormalized`, `cumulativeBorrowsMultiplier`,
        // `totalDepositsNormalized`, and `cumulativeDepositsMultiplier`

        // before the updating, the liquidity is (td * cdm - tb * cbm)
        // after the updating, the liquidity is
        // (td * cdm * depositRateMultiplier - tb * cbm * borrowRateMultiplier)
        // so we can get
        // depositRateMultiplier = utilization * (borrowRateMultiplier - 1) + 1
        int128 totalDepositRateX18 = utilizationRatioX18.mul(
            borrowRateMultiplierX18 - ONE
        );

        // deduct protocol fees
        int128 realizedDepositRateX18 = totalDepositRateX18.mul(
            ONE - _fees.getInterestFeeFractionX18(productId)
        );

        // pass fees balance change
        int128 feesAmt = totalDeposits.mul(
            totalDepositRateX18 - realizedDepositRateX18
        );

        state.cumulativeBorrowsMultiplierX18 = state
            .cumulativeBorrowsMultiplierX18
            .mul(borrowRateMultiplierX18);

        state.cumulativeDepositsMultiplierX18 = state
            .cumulativeDepositsMultiplierX18
            .mul(ONE + realizedDepositRateX18);

        if (feesAmt != 0) {
            BalanceNormalized memory feesAccBalance = balances[productId][
                FEES_ACCOUNT
            ].balance;
            _updateBalanceNormalized(state, feesAccBalance, feesAmt);
            balances[productId][FEES_ACCOUNT].balance = feesAccBalance;
        }
    }

    function balanceNormalizedToBalance(
        State memory state,
        BalanceNormalized memory balance
    ) internal pure returns (Balance memory) {
        int128 cumulativeMultiplierX18;
        if (balance.amountNormalized > 0) {
            cumulativeMultiplierX18 = state.cumulativeDepositsMultiplierX18;
        } else {
            cumulativeMultiplierX18 = state.cumulativeBorrowsMultiplierX18;
        }

        return
            Balance(
                balance.amountNormalized.mul(cumulativeMultiplierX18),
                cumulativeMultiplierX18
            );
    }

    function getStateAndBalance(uint32 productId, bytes32 subaccount)
        public
        view
        returns (State memory, Balance memory)
    {
        State memory state = states[productId];
        BalanceNormalized memory balance = balances[productId][subaccount]
            .balance;
        return (state, balanceNormalizedToBalance(state, balance));
    }

    function getBalance(uint32 productId, bytes32 subaccount)
        public
        view
        returns (Balance memory)
    {
        State memory state = states[productId];
        BalanceNormalized memory balance = balances[productId][subaccount]
            .balance;
        return balanceNormalizedToBalance(state, balance);
    }

    function getBalanceAmount(uint32 productId, bytes32 subaccount)
        external
        view
        returns (int128)
    {
        return getBalance(productId, subaccount).amount;
    }

    function hasBalance(uint32 productId, bytes32 subaccount)
        external
        view
        returns (bool)
    {
        Balances memory allBalances = balances[productId][subaccount];
        return
            allBalances.balance.amountNormalized != 0 ||
            allBalances.lpBalance.amount != 0;
    }

    function getStatesAndBalances(uint32 productId, bytes32 subaccount)
        external
        view
        returns (
            LpState memory,
            LpBalance memory,
            State memory,
            Balance memory
        )
    {
        LpState memory lpState = lpStates[productId];
        State memory state = states[productId];
        LpBalance memory lpBalance = balances[productId][subaccount].lpBalance;
        BalanceNormalized memory balance = balances[productId][subaccount]
            .balance;

        return (
            lpState,
            lpBalance,
            state,
            balanceNormalizedToBalance(state, balance)
        );
    }

    function getBalances(uint32 productId, bytes32 subaccount)
        external
        view
        returns (LpBalance memory, Balance memory)
    {
        State memory state = states[productId];
        LpBalance memory lpBalance = balances[productId][subaccount].lpBalance;
        BalanceNormalized memory balance = balances[productId][subaccount]
            .balance;

        return (lpBalance, balanceNormalizedToBalance(state, balance));
    }

    function getLpState(uint32 productId)
        external
        view
        returns (LpState memory)
    {
        return lpStates[productId];
    }

    function updateStates(uint128 dt) external onlyEndpoint {
        State memory quoteState = states[QUOTE_PRODUCT_ID];
        _updateState(QUOTE_PRODUCT_ID, quoteState, dt);

        for (uint32 i = 0; i < productIds.length; i++) {
            uint32 productId = productIds[i];
            if (productId == QUOTE_PRODUCT_ID) {
                continue;
            }
            State memory state = states[productId];
            if (state.totalDepositsNormalized == 0) {
                continue;
            }
            require(dt < 7 * SECONDS_PER_DAY, ERR_INVALID_TIME);
            LpState memory lpState = lpStates[productId];
            _updateState(productId, state, dt);
            _updateBalanceWithoutDelta(state, lpState.base);
            _updateBalanceWithoutDelta(quoteState, lpState.quote);
            lpStates[productId] = lpState;
            states[productId] = state;
            _productUpdate(productId);
        }
        states[QUOTE_PRODUCT_ID] = quoteState;
        _productUpdate(QUOTE_PRODUCT_ID);
    }
}
