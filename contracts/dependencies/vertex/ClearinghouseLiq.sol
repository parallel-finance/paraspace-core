// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "hardhat/console.sol";

import "./common/Constants.sol";
import "./interfaces/clearinghouse/IClearinghouseLiq.sol";
import "./interfaces/clearinghouse/IClearinghouse.sol";
import "./interfaces/engine/IProductEngine.sol";
import "./interfaces/engine/ISpotEngine.sol";
import "./interfaces/IOffchainBook.sol";
import "./libraries/ERC20Helper.sol";
import "./libraries/MathHelper.sol";
import "./libraries/MathSD21x18.sol";
import "./interfaces/engine/IPerpEngine.sol";
import "./EndpointGated.sol";
import "./interfaces/IEndpoint.sol";
import "./ClearinghouseRisk.sol";
import "./ClearinghouseStorage.sol";
import "./Version.sol";

contract ClearinghouseLiq is
    ClearinghouseRisk,
    ClearinghouseStorage,
    IClearinghouseLiq,
    Version
{
    using MathSD21x18 for int128;

    function getHealthFromClearinghouse(
        bytes32 subaccount,
        IProductEngine.HealthType healthType
    ) internal view returns (int128 health) {
        return IClearinghouse(clearinghouse).getHealth(subaccount, healthType);
    }

    function isUnderInitial(bytes32 subaccount) public view returns (bool) {
        // Weighted initial health with limit orders < 0
        return
            getHealthFromClearinghouse(
                subaccount,
                IProductEngine.HealthType.INITIAL
            ) < 0;
    }

    function isAboveInitial(bytes32 subaccount) public view returns (bool) {
        // Weighted initial health with limit orders < 0
        return
            getHealthFromClearinghouse(
                subaccount,
                IProductEngine.HealthType.INITIAL
            ) > 0;
    }

    function isUnderMaintenance(bytes32 subaccount)
        internal
        view
        returns (bool)
    {
        // Weighted maintenance health < 0
        return
            getHealthFromClearinghouse(
                subaccount,
                IProductEngine.HealthType.MAINTENANCE
            ) < 0;
    }

    function _getOrderbook(uint32 productId) internal view returns (address) {
        return address(productToEngine[productId].getOrderbook(productId));
    }

    struct HealthGroupSummary {
        uint32 perpId;
        int128 perpAmount;
        int128 perpVQuote;
        uint32 spotId;
        int128 spotAmount;
        int128 basisAmount;
    }

    function describeHealthGroup(
        ISpotEngine spotEngine,
        IPerpEngine perpEngine,
        uint32 groupId,
        bytes32 subaccount
    ) internal view returns (HealthGroupSummary memory summary) {
        HealthGroup memory group = HealthGroup(
            groupId * 2 + 1,
            groupId * 2 + 2
        );

        summary.spotId = group.spotId;
        summary.perpId = group.perpId;

        // we pretend VRTX balance always being 0 to make it not liquidatable.
        if (group.spotId != VRTX_PRODUCT_ID) {
            (, ISpotEngine.Balance memory balance) = spotEngine
                .getStateAndBalance(group.spotId, subaccount);
            summary.spotAmount = balance.amount;
        }

        {
            (, IPerpEngine.Balance memory balance) = perpEngine
                .getStateAndBalance(group.perpId, subaccount);
            summary.perpAmount = balance.amount;
            summary.perpVQuote = balance.vQuoteBalance;
        }

        if ((summary.spotAmount > 0) != (summary.perpAmount > 0)) {
            if (summary.spotAmount > 0) {
                summary.basisAmount = MathHelper.min(
                    summary.spotAmount,
                    -summary.perpAmount
                );
            } else {
                summary.basisAmount = MathHelper.max(
                    summary.spotAmount,
                    -summary.perpAmount
                );
            }
            summary.spotAmount -= summary.basisAmount;
            summary.perpAmount += summary.basisAmount;
        }
    }

    function assertLiquidationAmount(
        int128 originalBalance,
        int128 liquidationAmount
    ) internal pure {
        require(
            originalBalance != 0 && liquidationAmount != 0,
            ERR_NOT_LIQUIDATABLE_AMT
        );
        if (liquidationAmount > 0) {
            require(
                originalBalance >= liquidationAmount,
                ERR_NOT_LIQUIDATABLE_AMT
            );
        } else {
            require(
                originalBalance <= liquidationAmount,
                ERR_NOT_LIQUIDATABLE_AMT
            );
        }
    }

    struct LiquidationVars {
        int128 liquidationPriceX18;
        int128 excessPerpToLiquidate;
        int128 liquidationPayment;
        int128 insuranceCover;
        int128 oraclePriceX18;
        int128 liquidationFees;
        int128 perpSizeIncrement;
    }

    function settlePnlAgainstLiquidator(
        ISpotEngine spotEngine,
        IPerpEngine perpEngine,
        bytes32 liquidator,
        bytes32 liquidatee,
        uint32 perpId,
        int128 positionPnl
    ) internal {
        IProductEngine.ProductDelta[] memory deltas;
        deltas = new IProductEngine.ProductDelta[](2);
        deltas[0] = IProductEngine.ProductDelta({
            productId: perpId,
            subaccount: liquidatee,
            amountDelta: 0,
            vQuoteDelta: -positionPnl
        });
        deltas[1] = IProductEngine.ProductDelta({
            productId: perpId,
            subaccount: liquidator,
            amountDelta: 0,
            vQuoteDelta: positionPnl
        });
        perpEngine.applyDeltas(deltas);

        deltas = new IProductEngine.ProductDelta[](2);
        deltas[0] = IProductEngine.ProductDelta({
            productId: QUOTE_PRODUCT_ID,
            subaccount: liquidatee,
            amountDelta: positionPnl,
            vQuoteDelta: 0
        });
        deltas[1] = IProductEngine.ProductDelta({
            productId: QUOTE_PRODUCT_ID,
            subaccount: liquidator,
            amountDelta: -positionPnl,
            vQuoteDelta: 0
        });
        spotEngine.applyDeltas(deltas);
    }

    function finalizeSubaccount(
        ISpotEngine spotEngine,
        IPerpEngine perpEngine,
        bytes32 liquidator,
        bytes32 liquidatee
    ) internal {
        // check whether the subaccount can be finalized:
        // - all perps positions have closed
        // - all spread positions have closed
        // - all spot assets have closed
        // - all positive pnls have been settled
        // - after settling all positive pnls, if (quote + insurance) is positive,
        //   all spot liabilities have closed
        IProductEngine.ProductDelta[] memory deltas;

        for (uint32 i = 0; i <= maxHealthGroup; ++i) {
            HealthGroupSummary memory summary = describeHealthGroup(
                spotEngine,
                perpEngine,
                i,
                liquidatee
            );

            require(
                summary.perpAmount == 0 &&
                    summary.basisAmount == 0 &&
                    summary.spotAmount <= 0,
                ERR_NOT_FINALIZABLE_SUBACCOUNT
            );

            // spread positions have been closed so vQuote balance is the pnl
            int128 positionPnl = summary.perpVQuote;
            if (positionPnl > 0) {
                settlePnlAgainstLiquidator(
                    spotEngine,
                    perpEngine,
                    liquidator,
                    liquidatee,
                    summary.perpId,
                    positionPnl
                );
            }
        }

        (, ISpotEngine.Balance memory quoteBalance) = spotEngine
            .getStateAndBalance(QUOTE_PRODUCT_ID, liquidatee);

        insurance -= lastLiquidationFees;
        bool canLiquidateMore = (quoteBalance.amount + insurance) > 0;

        // settle negative pnls until quote balance becomes 0
        for (uint32 i = 0; i <= maxHealthGroup; ++i) {
            HealthGroupSummary memory summary = describeHealthGroup(
                spotEngine,
                perpEngine,
                i,
                liquidatee
            );
            if (canLiquidateMore) {
                require(
                    summary.spotAmount == 0,
                    ERR_NOT_FINALIZABLE_SUBACCOUNT
                );
            }
            if (quoteBalance.amount > 0) {
                int128 positionPnl = summary.perpVQuote;
                if (positionPnl < 0) {
                    int128 canSettle = MathHelper.max(
                        positionPnl,
                        -quoteBalance.amount
                    );
                    settlePnlAgainstLiquidator(
                        spotEngine,
                        perpEngine,
                        liquidator,
                        liquidatee,
                        summary.perpId,
                        canSettle
                    );
                    quoteBalance.amount += canSettle;
                }
            }
        }

        insurance = perpEngine.socializeSubaccount(liquidatee, insurance);

        // we can assure that quoteBalance must be non positive
        int128 insuranceCover = MathHelper.min(insurance, -quoteBalance.amount);
        if (insuranceCover > 0) {
            insurance -= insuranceCover;
            deltas = new IProductEngine.ProductDelta[](1);
            deltas[0] = IProductEngine.ProductDelta({
                productId: QUOTE_PRODUCT_ID,
                subaccount: liquidatee,
                amountDelta: insuranceCover,
                vQuoteDelta: 0
            });
            spotEngine.applyDeltas(deltas);
        }
        if (insurance == 0) {
            spotEngine.socializeSubaccount(liquidatee);
        }
        insurance += lastLiquidationFees;
    }

    function liquidateSubaccountImpl(IEndpoint.LiquidateSubaccount calldata txn)
        external
    {
        require(txn.sender != txn.liquidatee, ERR_UNAUTHORIZED);

        require(isUnderMaintenance(txn.liquidatee), ERR_NOT_LIQUIDATABLE);

        ISpotEngine spotEngine = ISpotEngine(
            address(engineByType[IProductEngine.EngineType.SPOT])
        );
        IPerpEngine perpEngine = IPerpEngine(
            address(engineByType[IProductEngine.EngineType.PERP])
        );
        insurance += spotEngine.decomposeLps(
            txn.liquidatee,
            txn.sender,
            address(fees)
        );
        insurance += perpEngine.decomposeLps(
            txn.liquidatee,
            txn.sender,
            address(fees)
        );

        if (
            getHealthFromClearinghouse(
                txn.liquidatee,
                IProductEngine.HealthType.INITIAL
            ) >= 0
        ) {
            return;
        }

        if (txn.healthGroup == type(uint32).max) {
            finalizeSubaccount(
                spotEngine,
                perpEngine,
                txn.sender,
                txn.liquidatee
            );
            return;
        }

        int128 amountToLiquidate = txn.amount;
        bool isLiability = (txn.mode !=
            uint8(IEndpoint.LiquidationMode.PERP)) && (amountToLiquidate < 0);

        IProductEngine.ProductDelta[] memory deltas;

        if (isLiability) {
            // check whether liabilities can be liquidated and settle
            // all positive pnls
            for (uint32 i = 0; i <= maxHealthGroup; ++i) {
                HealthGroupSummary memory groupSummary = describeHealthGroup(
                    spotEngine,
                    perpEngine,
                    i,
                    txn.liquidatee
                );

                // liabilities can only be liquidated after
                // - all perp positions (outside of spreads) have closed
                // - no spot nor spread assets exist
                require(
                    groupSummary.perpAmount == 0 &&
                        groupSummary.spotAmount <= 0 &&
                        groupSummary.basisAmount <= 0,
                    ERR_NOT_LIQUIDATABLE_LIABILITIES
                );

                // settle positive pnl against the liquidator
                int128 positionPnl;
                if (groupSummary.basisAmount == 0) {
                    positionPnl = groupSummary.perpVQuote;
                } else {
                    positionPnl = perpEngine.getPositionPnl(
                        groupSummary.perpId,
                        txn.liquidatee
                    );
                }

                if (positionPnl > 0) {
                    settlePnlAgainstLiquidator(
                        spotEngine,
                        perpEngine,
                        txn.sender,
                        txn.liquidatee,
                        groupSummary.perpId,
                        positionPnl
                    );
                }
            }
        }

        HealthGroupSummary memory summary = describeHealthGroup(
            spotEngine,
            perpEngine,
            txn.healthGroup,
            txn.liquidatee
        );
        LiquidationVars memory vars;

        vars.perpSizeIncrement = IOffchainBook(_getOrderbook(summary.perpId))
            .getMarket()
            .sizeIncrement;

        if (summary.basisAmount != 0) {
            int128 excessBasisAmount = summary.basisAmount %
                vars.perpSizeIncrement;
            summary.basisAmount -= excessBasisAmount;
            summary.spotAmount += excessBasisAmount;
            summary.perpAmount -= excessBasisAmount;
        }

        if (txn.mode != uint8(IEndpoint.LiquidationMode.SPOT)) {
            require(
                amountToLiquidate % vars.perpSizeIncrement == 0,
                ERR_INVALID_LIQUIDATION_AMOUNT
            );
        }

        if (txn.mode == uint8(IEndpoint.LiquidationMode.SPREAD)) {
            assertLiquidationAmount(summary.basisAmount, amountToLiquidate);
            require(summary.spotId != 0 && summary.perpId != 0);

            vars.liquidationPriceX18 = getSpreadLiqPriceX18(
                HealthGroup(summary.spotId, summary.perpId),
                amountToLiquidate
            );
            vars.oraclePriceX18 = getOraclePriceX18(summary.spotId);

            // there is a fixed amount of the spot component of the spread
            // we can liquidate until the insurance fund runs out of money
            // however we can still liquidate the remaining perp component
            // at the perp liquidation price. this way the spot liability just remains
            // and the spread liability decomposes into a spot liability which is
            // handled through socialization

            if (isLiability) {
                (, ISpotEngine.Balance memory quoteBalance) = spotEngine
                    .getStateAndBalance(QUOTE_PRODUCT_ID, txn.liquidatee);

                int128 maximumLiquidatable = MathHelper.ceil(
                    MathHelper.max(
                        // liquidate slightly more to not block socialization.
                        (quoteBalance.amount + insurance).div(
                            vars.liquidationPriceX18
                        ) + 1,
                        0
                    ),
                    vars.perpSizeIncrement
                );

                vars.excessPerpToLiquidate =
                    MathHelper.max(amountToLiquidate, -maximumLiquidatable) -
                    amountToLiquidate;
                amountToLiquidate += vars.excessPerpToLiquidate;
                vars.liquidationPayment = vars.liquidationPriceX18.mul(
                    amountToLiquidate
                );
                vars.insuranceCover = MathHelper.min(
                    insurance,
                    MathHelper.max(
                        0,
                        -vars.liquidationPayment - quoteBalance.amount
                    )
                );
            } else {
                vars.liquidationPayment = vars.liquidationPriceX18.mul(
                    amountToLiquidate
                );
            }

            vars.liquidationFees = (vars.oraclePriceX18 -
                vars.liquidationPriceX18)
                .mul(
                    fees.getLiquidationFeeFractionX18(
                        txn.sender,
                        summary.spotId
                    )
                )
                .mul(amountToLiquidate);

            deltas = new IProductEngine.ProductDelta[](4);
            deltas[0] = IProductEngine.ProductDelta({
                productId: summary.spotId,
                subaccount: txn.liquidatee,
                amountDelta: -amountToLiquidate,
                vQuoteDelta: vars.liquidationPayment
            });
            deltas[1] = IProductEngine.ProductDelta({
                productId: summary.spotId,
                subaccount: txn.sender,
                amountDelta: amountToLiquidate,
                vQuoteDelta: -vars.liquidationPayment
            });
            deltas[2] = IProductEngine.ProductDelta({
                productId: QUOTE_PRODUCT_ID,
                subaccount: txn.liquidatee,
                amountDelta: vars.liquidationPayment + vars.insuranceCover,
                vQuoteDelta: 0
            });
            deltas[3] = IProductEngine.ProductDelta({
                productId: QUOTE_PRODUCT_ID,
                subaccount: txn.sender,
                amountDelta: -vars.liquidationPayment,
                vQuoteDelta: 0
            });

            insurance -= vars.insuranceCover;
            spotEngine.applyDeltas(deltas);

            vars.oraclePriceX18 = getOraclePriceX18(summary.perpId);
            // write perp deltas
            // in spread liquidation, we do the liquidation payment
            // on top of liquidating the spot. for perp we simply
            // transfer the balances at 0 pnl
            // (ie. vQuoteAmount == amount * perpPrice)
            int128 perpQuoteDelta = amountToLiquidate.mul(vars.oraclePriceX18);

            vars.liquidationPriceX18 = getLiqPriceX18(
                summary.perpId,
                vars.excessPerpToLiquidate
            );

            int128 excessPerpQuoteDelta = vars.liquidationPriceX18.mul(
                vars.excessPerpToLiquidate
            );

            vars.liquidationFees += (vars.oraclePriceX18 -
                vars.liquidationPriceX18)
                .mul(
                    fees.getLiquidationFeeFractionX18(
                        txn.sender,
                        summary.perpId
                    )
                )
                .mul(vars.excessPerpToLiquidate);

            deltas = new IProductEngine.ProductDelta[](2);
            deltas[0] = IProductEngine.ProductDelta({
                productId: summary.perpId,
                subaccount: txn.liquidatee,
                amountDelta: amountToLiquidate - vars.excessPerpToLiquidate,
                vQuoteDelta: -perpQuoteDelta + excessPerpQuoteDelta
            });
            deltas[1] = IProductEngine.ProductDelta({
                productId: summary.perpId,
                subaccount: txn.sender,
                amountDelta: -amountToLiquidate + vars.excessPerpToLiquidate,
                vQuoteDelta: perpQuoteDelta -
                    excessPerpQuoteDelta -
                    vars.liquidationFees
            });
            perpEngine.applyDeltas(deltas);
        } else if (txn.mode == uint8(IEndpoint.LiquidationMode.SPOT)) {
            uint32 productId = summary.spotId;
            require(
                productId != QUOTE_PRODUCT_ID,
                ERR_INVALID_LIQUIDATION_PARAMS
            );
            assertLiquidationAmount(summary.spotAmount, amountToLiquidate);
            (, ISpotEngine.Balance memory quoteBalance) = spotEngine
                .getStateAndBalance(QUOTE_PRODUCT_ID, txn.liquidatee);

            vars.liquidationPriceX18 = getLiqPriceX18(
                productId,
                amountToLiquidate
            );
            vars.oraclePriceX18 = getOraclePriceX18(productId);

            if (isLiability) {
                int128 maximumLiquidatable = MathHelper.max(
                    // liquidate slightly more to not block socialization.
                    (quoteBalance.amount + insurance).div(
                        vars.liquidationPriceX18
                    ) + 1,
                    0
                );
                amountToLiquidate = MathHelper.max(
                    amountToLiquidate,
                    -maximumLiquidatable
                );
            }
            vars.liquidationPayment = vars.liquidationPriceX18.mul(
                amountToLiquidate
            );

            vars.liquidationFees = (vars.oraclePriceX18 -
                vars.liquidationPriceX18)
                .mul(fees.getLiquidationFeeFractionX18(txn.sender, productId))
                .mul(amountToLiquidate);

            // quoteBalance.amount + liquidationPayment18 + insuranceCover == 0
            vars.insuranceCover = (isLiability)
                ? MathHelper.min(
                    insurance,
                    MathHelper.max(
                        0,
                        -vars.liquidationPayment - quoteBalance.amount
                    )
                )
                : int128(0);

            deltas = new IProductEngine.ProductDelta[](4);
            deltas[0] = IProductEngine.ProductDelta({
                productId: productId,
                subaccount: txn.liquidatee,
                amountDelta: -amountToLiquidate,
                vQuoteDelta: vars.liquidationPayment
            });
            deltas[1] = IProductEngine.ProductDelta({
                productId: productId,
                subaccount: txn.sender,
                amountDelta: amountToLiquidate,
                vQuoteDelta: -vars.liquidationPayment
            });
            deltas[2] = IProductEngine.ProductDelta({
                productId: QUOTE_PRODUCT_ID,
                subaccount: txn.liquidatee,
                amountDelta: vars.liquidationPayment + vars.insuranceCover,
                vQuoteDelta: 0
            });
            deltas[3] = IProductEngine.ProductDelta({
                productId: QUOTE_PRODUCT_ID,
                subaccount: txn.sender,
                amountDelta: -vars.liquidationPayment - vars.liquidationFees,
                vQuoteDelta: 0
            });

            insurance -= vars.insuranceCover;
            spotEngine.applyDeltas(deltas);
        } else if (txn.mode == uint8(IEndpoint.LiquidationMode.PERP)) {
            uint32 productId = summary.perpId;
            require(
                productId != QUOTE_PRODUCT_ID,
                ERR_INVALID_LIQUIDATION_PARAMS
            );
            assertLiquidationAmount(summary.perpAmount, amountToLiquidate);

            vars.liquidationPriceX18 = getLiqPriceX18(
                productId,
                amountToLiquidate
            );
            vars.oraclePriceX18 = getOraclePriceX18(productId);

            vars.liquidationPayment = vars.liquidationPriceX18.mul(
                amountToLiquidate
            );
            vars.liquidationFees = (vars.oraclePriceX18 -
                vars.liquidationPriceX18)
                .mul(fees.getLiquidationFeeFractionX18(txn.sender, productId))
                .mul(amountToLiquidate);

            deltas = new IProductEngine.ProductDelta[](2);
            deltas[0] = IProductEngine.ProductDelta({
                productId: productId,
                subaccount: txn.liquidatee,
                amountDelta: -amountToLiquidate,
                vQuoteDelta: vars.liquidationPayment
            });
            deltas[1] = IProductEngine.ProductDelta({
                productId: productId,
                subaccount: txn.sender,
                amountDelta: amountToLiquidate,
                vQuoteDelta: -vars.liquidationPayment - vars.liquidationFees
            });
            perpEngine.applyDeltas(deltas);
        } else {
            revert(ERR_INVALID_LIQUIDATION_PARAMS);
        }

        // it's ok to let initial health become 0
        require(!isAboveInitial(txn.liquidatee), ERR_LIQUIDATED_TOO_MUCH);
        require(!isUnderInitial(txn.sender), ERR_SUBACCT_HEALTH);

        insurance += vars.liquidationFees;

        // if insurance is not enough for making a subaccount healthy, we should
        // - use all insurance to buy its liabilities, then
        // - socialize the subaccount

        // however, after the first step, insurance funds will be refilled a little bit
        // which blocks the second step, so we keep the fees of the last liquidation and
        // do not use this part in socialization to unblock it.
        lastLiquidationFees = vars.liquidationFees;

        emit Liquidation(
            txn.sender,
            txn.liquidatee,
            // 0 -> spread, 1 -> spot, 2 -> perp
            txn.mode,
            txn.healthGroup,
            txn.amount, // amount that was liquidated
            // this is the amount of product transferred from liquidatee
            // to liquidator; this and the following field will have the same sign
            // if spread, one unit represents one long spot and one short perp
            // i.e. if amount == -1, it means a short spot and a long perp was liquidated
            vars.liquidationPayment, // add actual liquidatee quoteDelta
            // meaning there was a payment of liquidationPayment
            // from liquidator to liquidatee for the liquidated products
            vars.insuranceCover
        );
    }
}
