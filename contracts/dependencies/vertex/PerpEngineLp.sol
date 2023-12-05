// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./PerpEngineState.sol";

abstract contract PerpEngineLp is PerpEngineState {
    using MathSD21x18 for int128;

    function mintLp(
        uint32 productId,
        bytes32 subaccount,
        int128 amountBase,
        int128 quoteAmountLow,
        int128 quoteAmountHigh
    ) external {
        checkCanApplyDeltas();

        int128 sizeIncrement = IOffchainBook(getOrderbook(productId))
            .getMarket()
            .sizeIncrement;

        require(
            amountBase > 0 &&
                quoteAmountLow > 0 &&
                quoteAmountHigh > 0 &&
                amountBase % sizeIncrement == 0,
            ERR_INVALID_LP_AMOUNT
        );

        (
            LpState memory lpState,
            LpBalance memory lpBalance,
            State memory state,
            Balance memory balance
        ) = getStatesAndBalances(productId, subaccount);

        int128 amountQuote = (lpState.base == 0)
            ? amountBase.mul(getOraclePriceX18(productId))
            : amountBase.mul(lpState.quote.div(lpState.base));
        require(amountQuote >= quoteAmountLow, ERR_SLIPPAGE_TOO_HIGH);
        require(amountQuote <= quoteAmountHigh, ERR_SLIPPAGE_TOO_HIGH);

        int128 toMint;
        if (lpState.supply == 0) {
            toMint = amountBase + amountQuote;
        } else {
            toMint = amountBase.div(lpState.base).mul(lpState.supply);
        }

        state.openInterest += amountBase;

        lpState.base += amountBase;
        lpState.quote += amountQuote;
        lpBalance.amount += toMint;
        _updateBalance(state, balance, -amountBase, -amountQuote);
        lpState.supply += toMint;

        lpBalances[productId][subaccount] = lpBalance;
        states[productId] = state;
        lpStates[productId] = lpState;
        balances[productId][subaccount] = balance;

        _balanceUpdate(productId, subaccount);
    }

    function burnLp(
        uint32 productId,
        bytes32 subaccount,
        int128 amountLp
    ) public returns (int128 amountBase, int128 amountQuote) {
        checkCanApplyDeltas();
        require(amountLp > 0, ERR_INVALID_LP_AMOUNT);
        int128 sizeIncrement = IOffchainBook(getOrderbook(productId))
            .getMarket()
            .sizeIncrement;

        (
            LpState memory lpState,
            LpBalance memory lpBalance,
            State memory state,
            Balance memory balance
        ) = getStatesAndBalances(productId, subaccount);

        if (amountLp == type(int128).max) {
            amountLp = lpBalance.amount;
        }
        if (amountLp == 0) {
            return (0, 0);
        }

        require(lpBalance.amount >= amountLp, ERR_INSUFFICIENT_LP);
        lpBalance.amount -= amountLp;

        amountBase = MathHelper.floor(
            int128((int256(amountLp) * lpState.base) / lpState.supply),
            sizeIncrement
        );

        amountQuote = int128(
            (int256(amountLp) * lpState.quote) / lpState.supply
        );

        state.openInterest -= amountBase;

        _updateBalance(state, balance, amountBase, amountQuote);
        lpState.base -= amountBase;
        lpState.quote -= amountQuote;
        lpState.supply -= amountLp;

        lpStates[productId] = lpState;
        lpBalances[productId][subaccount] = lpBalance;
        states[productId] = state;
        balances[productId][subaccount] = balance;

        _balanceUpdate(productId, subaccount);
    }

    function swapLp(
        uint32 productId,
        // maximum to swap
        int128 amount,
        int128 priceX18,
        int128 sizeIncrement,
        int128 lpSpreadX18
    ) external returns (int128 baseSwapped, int128 quoteSwapped) {
        checkCanApplyDeltas();
        require(amount % sizeIncrement == 0, ERR_INVALID_LP_AMOUNT);

        LpState memory lpState = lpStates[productId];
        if (lpState.base == 0 || lpState.quote == 0) {
            return (0, 0);
        }

        (baseSwapped, quoteSwapped) = MathHelper.swap(
            amount,
            lpState.base,
            lpState.quote,
            priceX18,
            sizeIncrement,
            lpSpreadX18
        );

        states[productId].openInterest += baseSwapped;

        lpState.base += baseSwapped;
        lpState.quote += quoteSwapped;
        lpStates[productId] = lpState;
        _productUpdate(productId);
    }

    function swapLp(
        uint32 productId,
        int128 baseDelta,
        int128 quoteDelta
    ) external returns (int128, int128) {
        checkCanApplyDeltas();
        LpState memory lpState = lpStates[productId];
        require(
            MathHelper.isSwapValid(
                baseDelta,
                quoteDelta,
                lpState.base,
                lpState.quote
            ),
            ERR_INVALID_MAKER
        );

        states[productId].openInterest += baseDelta;

        lpState.base += baseDelta;
        lpState.quote += quoteDelta;
        lpStates[productId] = lpState;
        _productUpdate(productId);
        return (baseDelta, quoteDelta);
    }

    function decomposeLps(
        bytes32 liquidatee,
        bytes32 liquidator,
        address feeCalculator
    ) external returns (int128 liquidationFees) {
        for (uint128 i = 0; i < productIds.length; ++i) {
            uint32 productId = productIds[i];
            (, int128 amountQuote) = burnLp(
                productId,
                liquidatee,
                type(int128).max
            );
            int128 rewards = amountQuote.mul(
                (ONE -
                    RiskHelper._getWeightX18(
                        IClearinghouse(_clearinghouse).getRisk(productId),
                        amountQuote,
                        IProductEngine.HealthType.MAINTENANCE
                    )) / 50
            );
            int128 fees = rewards.mul(
                IFeeCalculator(feeCalculator).getLiquidationFeeFractionX18(
                    liquidator,
                    productId
                )
            );
            rewards -= fees;
            liquidationFees += fees;

            // transfer some of the burned proceeds to liquidator
            State memory state = states[productId];
            Balance memory liquidateeBalance = balances[productId][liquidatee];
            Balance memory liquidatorBalance = balances[productId][liquidator];

            _updateBalance(state, liquidateeBalance, 0, -rewards - fees);
            _updateBalance(state, liquidatorBalance, 0, rewards);

            states[productId] = state;
            balances[productId][liquidatee] = liquidateeBalance;
            balances[productId][liquidator] = liquidatorBalance;
            _balanceUpdate(productId, liquidator);
            _balanceUpdate(productId, liquidatee);
        }
    }
}
