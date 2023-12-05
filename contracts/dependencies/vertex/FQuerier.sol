// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./interfaces/clearinghouse/IClearinghouse.sol";
import "./interfaces/IOffchainBook.sol";
import "./interfaces/engine/ISpotEngine.sol";
import "./interfaces/engine/IPerpEngine.sol";
import "./interfaces/engine/IProductEngine.sol";
import "./libraries/MathSD21x18.sol";
import "./libraries/RiskHelper.sol";
import "./common/Constants.sol";
import "./Version.sol";

// NOTE: not related to VertexQuerier
// custom querier contract just for queries with FNode
// VertexQuerier has some issues with abi generation
contract FQuerier is Version {
    using MathSD21x18 for int128;

    IClearinghouse private clearinghouse;
    IEndpoint private endpoint;
    ISpotEngine private spotEngine;
    IPerpEngine private perpEngine;

    function initialize(address _clearinghouse) external {
        clearinghouse = IClearinghouse(_clearinghouse);
        endpoint = IEndpoint(clearinghouse.getEndpoint());

        spotEngine = ISpotEngine(
            clearinghouse.getEngineByType(IProductEngine.EngineType.SPOT)
        );

        perpEngine = IPerpEngine(
            clearinghouse.getEngineByType(IProductEngine.EngineType.PERP)
        );
    }

    struct SpotBalance {
        uint32 productId;
        ISpotEngine.LpBalance lpBalance;
        ISpotEngine.Balance balance;
    }

    struct PerpBalance {
        uint32 productId;
        IPerpEngine.LpBalance lpBalance;
        IPerpEngine.Balance balance;
    }

    // for config just go to the chain
    struct SpotProduct {
        uint32 productId;
        int128 oraclePriceX18;
        RiskHelper.Risk risk;
        ISpotEngine.Config config;
        ISpotEngine.State state;
        ISpotEngine.LpState lpState;
        BookInfo bookInfo;
    }

    struct PerpProduct {
        uint32 productId;
        int128 oraclePriceX18;
        RiskHelper.Risk risk;
        IPerpEngine.State state;
        IPerpEngine.LpState lpState;
        BookInfo bookInfo;
    }

    struct BookInfo {
        int128 sizeIncrement;
        int128 priceIncrementX18;
        int128 minSize;
        int128 collectedFees;
        int128 lpSpreadX18;
    }

    struct HealthInfo {
        int128 assets;
        int128 liabilities;
        int128 health;
    }

    struct SubaccountInfo {
        bytes32 subaccount;
        bool exists;
        HealthInfo[] healths;
        int128[][] healthContributions;
        uint32 spotCount;
        uint32 perpCount;
        SpotBalance[] spotBalances;
        PerpBalance[] perpBalances;
        SpotProduct[] spotProducts;
        PerpProduct[] perpProducts;
    }

    struct ProductInfo {
        SpotProduct[] spotProducts;
        PerpProduct[] perpProducts;
    }

    function getClearinghouse() external view returns (address) {
        return address(clearinghouse);
    }

    function _getAllProductIds()
        internal
        view
        returns (uint32[] memory spotIds, uint32[] memory perpIds)
    {
        spotIds = spotEngine.getProductIds();
        perpIds = perpEngine.getProductIds();
    }

    function getAllProducts() public view returns (ProductInfo memory) {
        (
            uint32[] memory spotIds,
            uint32[] memory perpIds
        ) = _getAllProductIds();
        return
            ProductInfo({
                spotProducts: getSpotProducts(spotIds),
                perpProducts: getPerpProducts(perpIds)
            });
    }

    function getSpotProducts(uint32[] memory productIds)
        public
        view
        returns (SpotProduct[] memory spotProducts)
    {
        spotProducts = new SpotProduct[](productIds.length);

        for (uint32 i = 0; i < productIds.length; i++) {
            uint32 productId = productIds[i];
            spotProducts[i] = getSpotProduct(productId);
        }
    }

    function getPerpProducts(uint32[] memory productIds)
        public
        view
        returns (PerpProduct[] memory perpProducts)
    {
        perpProducts = new PerpProduct[](productIds.length);

        for (uint32 i = 0; i < productIds.length; i++) {
            uint32 productId = productIds[i];
            perpProducts[i] = getPerpProduct(productId);
        }
    }

    function getSpotProduct(uint32 productId)
        public
        view
        returns (SpotProduct memory)
    {
        (
            ISpotEngine.LpState memory lpState,
            ,
            ISpotEngine.State memory state,

        ) = spotEngine.getStatesAndBalances(productId, 0);
        int128 oraclePriceX18 = productId == QUOTE_PRODUCT_ID
            ? ONE
            : endpoint.getPricesX18((productId - 1) / 2).spotPriceX18;
        return
            SpotProduct({
                productId: productId,
                oraclePriceX18: oraclePriceX18,
                risk: clearinghouse.getRisk(productId),
                config: spotEngine.getConfig(productId),
                state: state,
                lpState: lpState,
                bookInfo: productId != 0
                    ? getBookInfo(productId, spotEngine)
                    : BookInfo(0, 0, 0, 0, 0)
            });
    }

    function getPerpProduct(uint32 productId)
        public
        view
        returns (PerpProduct memory)
    {
        (
            IPerpEngine.LpState memory lpState,
            ,
            IPerpEngine.State memory state,

        ) = perpEngine.getStatesAndBalances(productId, 0);

        return
            PerpProduct({
                productId: productId,
                oraclePriceX18: endpoint
                    .getPricesX18((productId - 1) / 2)
                    .perpPriceX18,
                risk: clearinghouse.getRisk(productId),
                state: state,
                lpState: lpState,
                bookInfo: productId != 0
                    ? getBookInfo(productId, perpEngine)
                    : BookInfo(0, 0, 0, 0, 0)
            });
    }

    function getSubaccountInfo(bytes32 subaccount)
        public
        view
        returns (SubaccountInfo memory)
    {
        SubaccountInfo memory subaccountInfo;

        {
            (
                uint32[] memory spotIds,
                uint32[] memory perpIds
            ) = _getAllProductIds();

            // initial, maintenance, pnl
            subaccountInfo.subaccount = subaccount;
            subaccountInfo.exists = true;
            subaccountInfo.healths = new HealthInfo[](3);

            uint256 productIdsLength = spotIds.length + perpIds.length;
            subaccountInfo.healthContributions = new int128[][](
                productIdsLength
            );
            for (uint256 i = 0; i < productIdsLength; i++) {
                subaccountInfo.healthContributions[i] = new int128[](3);
            }

            subaccountInfo.spotBalances = new SpotBalance[](spotIds.length);
            subaccountInfo.perpBalances = new PerpBalance[](perpIds.length);
            subaccountInfo.spotProducts = new SpotProduct[](spotIds.length);
            subaccountInfo.perpProducts = new PerpProduct[](perpIds.length);
        }

        uint32 maxHealthGroup = clearinghouse.getMaxHealthGroup();
        for (uint32 i = 0; i <= maxHealthGroup; i++) {
            IClearinghouse.HealthGroup memory group;
            group.spotId = i * 2 + 1;
            group.perpId = i * 2 + 2;
            IClearinghouseState.HealthVars memory healthVars;
            healthVars.pricesX18 = endpoint.getPricesX18(i);

            {
                (
                    ISpotEngine.LpState memory lpState,
                    ISpotEngine.LpBalance memory lpBalance,
                    ISpotEngine.State memory state,
                    ISpotEngine.Balance memory balance
                ) = spotEngine.getStatesAndBalances(group.spotId, subaccount);

                if (lpBalance.amount != 0) {
                    (int128 ammBase, int128 ammQuote) = MathHelper
                        .ammEquilibrium(
                            lpState.base.amount,
                            lpState.quote.amount,
                            healthVars.pricesX18.spotPriceX18
                        );

                    for (uint128 j = 0; j < 3; ++j) {
                        subaccountInfo.healthContributions[group.spotId][
                                j
                            ] += ammQuote.mul(lpBalance.amount).div(
                            lpState.supply
                        );
                    }

                    healthVars.spotInLpAmount = ammBase
                        .mul(lpBalance.amount)
                        .div(lpState.supply);
                }

                healthVars.spotAmount = balance.amount;
                healthVars.spotRisk = clearinghouse.getRisk(group.spotId);

                subaccountInfo.spotBalances[
                    subaccountInfo.spotCount
                ] = SpotBalance({
                    productId: group.spotId,
                    balance: balance,
                    lpBalance: lpBalance
                });
                subaccountInfo.spotProducts[
                    subaccountInfo.spotCount++
                ] = SpotProduct({
                    productId: group.spotId,
                    oraclePriceX18: healthVars.pricesX18.spotPriceX18,
                    risk: healthVars.spotRisk,
                    config: spotEngine.getConfig(group.spotId),
                    state: state,
                    lpState: lpState,
                    bookInfo: getBookInfo(group.spotId, spotEngine)
                });
            }
            {
                (
                    IPerpEngine.LpState memory lpState,
                    IPerpEngine.LpBalance memory lpBalance,
                    IPerpEngine.State memory state,
                    IPerpEngine.Balance memory balance
                ) = perpEngine.getStatesAndBalances(group.perpId, subaccount);

                if (lpBalance.amount != 0) {
                    (int128 ammBase, int128 ammQuote) = MathHelper
                        .ammEquilibrium(
                            lpState.base,
                            lpState.quote,
                            healthVars.pricesX18.perpPriceX18
                        );

                    for (uint128 j = 0; j < 3; ++j) {
                        subaccountInfo.healthContributions[group.perpId][
                                j
                            ] += ammQuote.mul(lpBalance.amount).div(
                            lpState.supply
                        );
                    }
                    healthVars.perpInLpAmount = ammBase
                        .mul(lpBalance.amount)
                        .div(lpState.supply);
                }

                for (uint128 j = 0; j < 3; ++j) {
                    subaccountInfo.healthContributions[group.perpId][
                        j
                    ] += balance.vQuoteBalance;
                }

                healthVars.perpAmount = balance.amount;
                healthVars.perpRisk = clearinghouse.getRisk(group.perpId);

                if (
                    (healthVars.spotAmount > 0) != (healthVars.perpAmount > 0)
                ) {
                    if (healthVars.spotAmount > 0) {
                        healthVars.basisAmount = MathHelper.min(
                            healthVars.spotAmount,
                            -healthVars.perpAmount
                        );
                    } else {
                        healthVars.basisAmount = MathHelper.max(
                            healthVars.spotAmount,
                            -healthVars.perpAmount
                        );
                    }
                    healthVars.spotAmount -= healthVars.basisAmount;
                    healthVars.perpAmount += healthVars.basisAmount;
                }

                subaccountInfo.perpBalances[
                    subaccountInfo.perpCount
                ] = PerpBalance({
                    productId: group.perpId,
                    balance: balance,
                    lpBalance: lpBalance
                });
                subaccountInfo.perpProducts[
                    subaccountInfo.perpCount++
                ] = PerpProduct({
                    productId: group.perpId,
                    oraclePriceX18: healthVars.pricesX18.perpPriceX18,
                    risk: healthVars.perpRisk,
                    state: state,
                    lpState: lpState,
                    bookInfo: getBookInfo(group.perpId, perpEngine)
                });
            }

            // risk for the basis trade, discounted
            if (healthVars.basisAmount != 0) {
                int128 posAmount = MathHelper.abs(healthVars.basisAmount);

                for (uint8 healthType = 0; healthType < 3; ++healthType) {
                    // add the actual value of the basis (PNL)
                    int128 totalSpreadPenalty = RiskHelper
                        ._getSpreadPenaltyX18(
                            healthVars.spotRisk,
                            healthVars.perpRisk,
                            posAmount,
                            IProductEngine.HealthType(healthType)
                        )
                        .mul(posAmount)
                        .mul(
                            healthVars.pricesX18.spotPriceX18 +
                                healthVars.pricesX18.perpPriceX18
                        );

                    subaccountInfo.healthContributions[group.spotId][
                        healthType
                    ] +=
                        healthVars.pricesX18.spotPriceX18.mul(
                            healthVars.basisAmount
                        ) -
                        totalSpreadPenalty /
                        2;
                    subaccountInfo.healthContributions[group.perpId][
                        healthType
                    ] +=
                        healthVars.pricesX18.perpPriceX18.mul(
                            -healthVars.basisAmount
                        ) -
                        totalSpreadPenalty /
                        2;
                }
            }

            // apply risk for spot and perp positions
            int128 combinedSpot = healthVars.spotAmount +
                healthVars.spotInLpAmount;

            for (uint8 healthType = 0; healthType < 3; ++healthType) {
                int128 healthContribution = RiskHelper
                    ._getWeightX18(
                        healthVars.spotRisk,
                        combinedSpot,
                        IProductEngine.HealthType(healthType)
                    )
                    .mul(combinedSpot)
                    .mul(healthVars.pricesX18.spotPriceX18);

                // Spot LP penalty
                healthContribution -= (ONE -
                    RiskHelper._getWeightX18(
                        healthVars.spotRisk,
                        healthVars.spotInLpAmount,
                        IProductEngine.HealthType(healthType)
                    )).mul(healthVars.spotInLpAmount).mul(
                        healthVars.pricesX18.spotPriceX18
                    );

                subaccountInfo.healthContributions[group.spotId][
                        healthType
                    ] += healthContribution;
            }

            int128 combinedPerp = healthVars.perpAmount +
                healthVars.perpInLpAmount;

            for (uint8 healthType = 0; healthType < 3; ++healthType) {
                int128 healthContribution = RiskHelper
                    ._getWeightX18(
                        healthVars.perpRisk,
                        combinedPerp,
                        IProductEngine.HealthType(healthType)
                    )
                    .mul(combinedPerp)
                    .mul(healthVars.pricesX18.perpPriceX18);

                // perp LP penalty
                healthContribution -= (ONE -
                    RiskHelper._getWeightX18(
                        healthVars.perpRisk,
                        healthVars.perpInLpAmount,
                        IProductEngine.HealthType(healthType)
                    )).mul(healthVars.perpInLpAmount).mul(
                        healthVars.pricesX18.perpPriceX18
                    );

                subaccountInfo.healthContributions[group.perpId][
                        healthType
                    ] += healthContribution;
            }
        }

        // handle the quote balance since its not present in healthGroups
        {
            (
                ISpotEngine.State memory state,
                ISpotEngine.Balance memory balance
            ) = spotEngine.getStateAndBalance(QUOTE_PRODUCT_ID, subaccount);
            subaccountInfo
                .spotBalances[subaccountInfo.spotCount]
                .balance = balance;
            subaccountInfo
                .spotProducts[subaccountInfo.spotCount]
                .oraclePriceX18 = ONE;
            subaccountInfo
                .spotProducts[subaccountInfo.spotCount]
                .risk = clearinghouse.getRisk(QUOTE_PRODUCT_ID);
            subaccountInfo
                .spotProducts[subaccountInfo.spotCount]
                .config = spotEngine.getConfig(QUOTE_PRODUCT_ID);
            subaccountInfo
                .spotProducts[subaccountInfo.spotCount++]
                .state = state;

            for (uint128 i = 0; i < 3; ++i) {
                subaccountInfo.healthContributions[QUOTE_PRODUCT_ID][
                    i
                ] += balance.amount;
            }
        }

        for (uint128 i = 0; i < 3; ++i) {
            for (
                uint128 j = 0;
                j < subaccountInfo.healthContributions.length;
                ++j
            ) {
                if (subaccountInfo.healthContributions[j][i] > 0) {
                    subaccountInfo.healths[i].assets += subaccountInfo
                        .healthContributions[j][i];
                } else {
                    subaccountInfo.healths[i].liabilities -= subaccountInfo
                        .healthContributions[j][i];
                }
            }
            subaccountInfo.healths[i].health =
                subaccountInfo.healths[i].assets -
                subaccountInfo.healths[i].liabilities;
        }

        return subaccountInfo;
    }

    function getSpotBalances(bytes32 subaccount, uint32[] memory productIds)
        public
        view
        returns (SpotBalance[] memory spotBalances)
    {
        spotBalances = new SpotBalance[](productIds.length);

        for (uint32 i = 0; i < productIds.length; i++) {
            uint32 productId = productIds[i];
            spotBalances[i] = getSpotBalance(subaccount, productId);
        }
    }

    function getPerpBalances(bytes32 subaccount, uint32[] memory productIds)
        public
        view
        returns (PerpBalance[] memory perpBalances)
    {
        perpBalances = new PerpBalance[](productIds.length);

        for (uint32 i = 0; i < productIds.length; i++) {
            uint32 productId = productIds[i];
            perpBalances[i] = getPerpBalance(subaccount, productId);
        }
    }

    function getSpotBalance(bytes32 subaccount, uint32 productId)
        public
        view
        returns (SpotBalance memory)
    {
        (
            ,
            ISpotEngine.LpBalance memory lpBalance,
            ,
            ISpotEngine.Balance memory balance
        ) = spotEngine.getStatesAndBalances(productId, subaccount);
        return
            SpotBalance({
                productId: productId,
                lpBalance: lpBalance,
                balance: balance
            });
    }

    function getPerpBalance(bytes32 subaccount, uint32 productId)
        public
        view
        returns (PerpBalance memory)
    {
        (
            ,
            IPerpEngine.LpBalance memory lpBalance,
            ,
            IPerpEngine.Balance memory balance
        ) = perpEngine.getStatesAndBalances(productId, subaccount);
        return
            PerpBalance({
                productId: productId,
                lpBalance: lpBalance,
                balance: balance
            });
    }

    function getBookInfo(uint32 productId, IProductEngine engine)
        public
        view
        returns (BookInfo memory bookInfo)
    {
        IOffchainBook book = IOffchainBook(engine.getOrderbook(productId));
        IOffchainBook.Market memory market = book.getMarket();
        return
            BookInfo({
                sizeIncrement: market.sizeIncrement,
                priceIncrementX18: market.priceIncrementX18,
                minSize: book.getMinSize(),
                collectedFees: market.collectedFees,
                lpSpreadX18: market.lpSpreadX18
            });
    }
}
