// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/engine/IProductEngine.sol";
import "./interfaces/IFeeCalculator.sol";
import "./libraries/MathSD21x18.sol";
import "./common/Constants.sol";
import "./libraries/MathHelper.sol";
import "./OffchainBook.sol";
import "./interfaces/IOffchainBook.sol";
import "./EndpointGated.sol";
import "./common/Errors.sol";
import "./Version.sol";

// Similar to: https://stackoverflow.com/questions/1023860/exponential-moving-average-sampled-at-varying-times
// Set time constant tau = 600
// normal calculation for factor looks like: e^(-timedelta/600)
// change this to (e^-1/600)^(timedelta)
// TIME_CONSTANT -> e^(-1/600)
int128 constant EMA_TIME_CONSTANT_X18 = 998334721450938752;

contract OffchainBook is
    IOffchainBook,
    EndpointGated,
    EIP712Upgradeable,
    Version
{
    using MathSD21x18 for int128;

    IClearinghouse public clearinghouse;
    IProductEngine public engine;
    IFeeCalculator public fees;
    Market public market;

    mapping(bytes32 => int128) public filledAmounts;
    int128 minSize;

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
    ) external initializer {
        __Ownable_init();
        setEndpoint(_endpoint);
        transferOwnership(_admin);

        __EIP712_init("Vertex", "0.0.1");
        clearinghouse = _clearinghouse;
        engine = _engine;
        fees = _fees;

        market = Market({
            productId: _productId,
            sizeIncrement: _sizeIncrement,
            priceIncrementX18: _priceIncrementX18,
            lpSpreadX18: _lpSpreadX18,
            collectedFees: 0,
            sequencerFees: 0
        });
        minSize = _minSize;
    }

    function modifyConfig(
        int128 _sizeIncrement,
        int128 _priceIncrementX18,
        int128 _minSize,
        int128 _lpSpreadX18
    ) external {
        require(msg.sender == address(engine), "only engine can modify config");
        market.sizeIncrement = _sizeIncrement;
        market.priceIncrementX18 = _priceIncrementX18;
        market.lpSpreadX18 = _lpSpreadX18;
        minSize = _minSize;
    }

    function getMinSize() external view returns (int128) {
        return minSize;
    }

    function getDigest(IEndpoint.Order memory order)
        public
        view
        returns (bytes32)
    {
        string
            memory structType = "Order(bytes32 sender,int128 priceX18,int128 amount,uint64 expiration,uint64 nonce)";
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(bytes(structType)),
                        order.sender,
                        order.priceX18,
                        order.amount,
                        order.expiration,
                        order.nonce
                    )
                )
            );
    }

    function _checkSignature(
        bytes32 subaccount,
        bytes32 digest,
        address linkedSigner,
        bytes memory signature
    ) internal view virtual returns (bool) {
        address signer = ECDSA.recover(digest, signature);
        return
            (signer != address(0)) &&
            (signer == address(uint160(bytes20(subaccount))) ||
                signer == linkedSigner);
    }

    function _expired(uint64 expiration) internal view returns (bool) {
        return expiration & ((1 << 58) - 1) <= getOracleTime();
    }

    function _isReduceOnly(uint64 expiration) internal view returns (bool) {
        return ((expiration >> 61) & 1) == 1;
    }

    function _isTakerFirst(bytes32 orderDigest) internal view returns (bool) {
        return filledAmounts[orderDigest] == 0;
    }

    function _validateOrder(
        Market memory _market,
        IEndpoint.SignedOrder memory signedOrder,
        bytes32 orderDigest,
        address linkedSigner
    ) internal view returns (bool) {
        IEndpoint.Order memory order = signedOrder.order;
        int128 filledAmount = filledAmounts[orderDigest];
        order.amount -= filledAmount;

        if (_isReduceOnly(order.expiration)) {
            int128 amount = engine.getBalanceAmount(
                _market.productId,
                order.sender
            );
            if ((order.amount > 0) == (amount > 0)) {
                order.amount = 0;
            } else if (order.amount > 0) {
                order.amount = MathHelper.min(order.amount, -amount);
            } else if (order.amount < 0) {
                order.amount = MathHelper.max(order.amount, -amount);
            }
        }

        return
            (order.priceX18 > 0) &&
            (order.priceX18 % _market.priceIncrementX18 == 0) &&
            _checkSignature(
                order.sender,
                orderDigest,
                linkedSigner,
                signedOrder.signature
            ) &&
            // valid amount
            (order.amount != 0) &&
            !_expired(order.expiration);
    }

    function _feeAmount(
        bytes32 subaccount,
        Market memory _market,
        int128 amount,
        bool taker,
        // is this the first instance of this taker order matching
        bool takerFirst
    ) internal view returns (int128, int128) {
        uint32 productId = _market.productId;
        int128 keepRateX18 = ONE -
            fees.getFeeFractionX18(subaccount, productId, taker);
        int128 newAmount = (amount > 0)
            ? amount.mul(keepRateX18)
            : amount.div(keepRateX18);
        int128 feeAmount = amount - newAmount;
        _market.collectedFees += feeAmount;
        if (takerFirst && taker) {
            newAmount -= TAKER_SEQUENCER_FEE;
            _market.sequencerFees += TAKER_SEQUENCER_FEE;
        }
        return (feeAmount, newAmount);
    }

    function feeAmount(
        bytes32 subaccount,
        Market memory _market,
        int128 amount,
        bool taker,
        // is this the first instance of this taker order matching
        bool takerFirst
    ) internal virtual returns (int128, int128) {
        return _feeAmount(subaccount, _market, amount, taker, takerFirst);
    }

    struct OrdersInfo {
        bytes32 takerDigest;
        bytes32 makerDigest;
        int128 makerAmount;
    }

    function _matchOrderAMM(
        Market memory _market,
        int128 baseDelta, // change in the LP's base position
        int128 quoteDelta, // change in the LP's quote position
        IEndpoint.SignedOrder memory taker
    ) internal returns (int128, int128) {
        // 1. assert that the price is better than the limit price
        int128 impliedPriceX18 = quoteDelta.div(baseDelta).abs();
        if (taker.order.amount > 0) {
            // if buying, the implied price must be lower than the limit price
            require(
                impliedPriceX18 <= taker.order.priceX18,
                ERR_ORDERS_CANNOT_BE_MATCHED
            );

            // AMM must be selling
            // magnitude of what AMM is selling must be less than or equal to what the taker is buying
            require(
                baseDelta < 0 && taker.order.amount >= -baseDelta,
                ERR_ORDERS_CANNOT_BE_MATCHED
            );
        } else {
            // if selling, the implied price must be higher than the limit price
            require(
                impliedPriceX18 >= taker.order.priceX18,
                ERR_ORDERS_CANNOT_BE_MATCHED
            );
            // AMM must be buying
            // magnitude of what AMM is buying must be less than or equal to what the taker is selling
            require(
                baseDelta > 0 && taker.order.amount <= -baseDelta,
                ERR_ORDERS_CANNOT_BE_MATCHED
            );
        }

        (int128 baseSwapped, int128 quoteSwapped) = engine.swapLp(
            _market.productId,
            baseDelta,
            quoteDelta
        );

        taker.order.amount += baseSwapped;
        return (-baseSwapped, -quoteSwapped);
    }

    function _matchOrderOrder(
        Market memory _market,
        IEndpoint.Order memory taker,
        IEndpoint.Order memory maker,
        OrdersInfo memory ordersInfo
    ) internal returns (int128 takerAmountDelta, int128 takerQuoteDelta) {
        // execution happens at the maker's price
        if (taker.amount < 0) {
            takerAmountDelta = MathHelper.max(taker.amount, -maker.amount);
        } else if (taker.amount > 0) {
            takerAmountDelta = MathHelper.min(taker.amount, -maker.amount);
        } else {
            return (0, 0);
        }

        takerAmountDelta -= takerAmountDelta % _market.sizeIncrement;

        int128 makerQuoteDelta = takerAmountDelta.mul(maker.priceX18);

        takerQuoteDelta = -makerQuoteDelta;

        // apply the maker fee
        int128 makerFee;
        (makerFee, makerQuoteDelta) = feeAmount(
            maker.sender,
            _market,
            makerQuoteDelta,
            false,
            false
        );

        taker.amount -= takerAmountDelta;
        maker.amount += takerAmountDelta;

        IProductEngine.ProductDelta[]
            memory deltas = new IProductEngine.ProductDelta[](2);

        // maker
        deltas[0] = IProductEngine.ProductDelta({
            productId: _market.productId,
            subaccount: maker.sender,
            amountDelta: -takerAmountDelta,
            vQuoteDelta: makerQuoteDelta
        });
        deltas[1] = IProductEngine.ProductDelta({
            productId: QUOTE_PRODUCT_ID,
            subaccount: maker.sender,
            amountDelta: makerQuoteDelta,
            vQuoteDelta: 0
        });

        engine.applyDeltas(deltas);

        emit FillOrder(
            ordersInfo.makerDigest,
            maker.sender,
            maker.priceX18,
            ordersInfo.makerAmount,
            maker.expiration,
            maker.nonce,
            false,
            makerFee,
            -takerAmountDelta,
            makerQuoteDelta
        );
    }

    function matchOrderAMM(
        IEndpoint.MatchOrderAMM calldata txn,
        address takerLinkedSigner
    ) external onlyEndpoint {
        Market memory _market = market;
        bytes32 takerDigest = getDigest(txn.taker.order);
        int128 takerAmount = txn.taker.order.amount;

        // need to convert the taker order from calldata into memory
        // otherwise modifications we make to the order's amounts
        // don't persist
        IEndpoint.SignedOrder memory taker = txn.taker;

        require(
            _validateOrder(_market, taker, takerDigest, takerLinkedSigner),
            ERR_INVALID_TAKER
        );

        bool isTakerFirst = _isTakerFirst(takerDigest);

        (int128 takerAmountDelta, int128 takerQuoteDelta) = _matchOrderAMM(
            _market,
            txn.baseDelta,
            txn.quoteDelta,
            taker
        );

        // apply the taker fee
        int128 takerFee;
        (takerFee, takerQuoteDelta) = feeAmount(
            taker.order.sender,
            _market,
            takerQuoteDelta,
            true,
            isTakerFirst
        );

        IProductEngine.ProductDelta[]
            memory deltas = new IProductEngine.ProductDelta[](2);

        // taker
        deltas[0] = IProductEngine.ProductDelta({
            productId: _market.productId,
            subaccount: taker.order.sender,
            amountDelta: takerAmountDelta,
            vQuoteDelta: takerQuoteDelta
        });
        deltas[1] = IProductEngine.ProductDelta({
            productId: QUOTE_PRODUCT_ID,
            subaccount: taker.order.sender,
            amountDelta: takerQuoteDelta,
            vQuoteDelta: 0
        });

        engine.applyDeltas(deltas);

        require(isHealthy(taker.order.sender), ERR_INVALID_TAKER);

        emit FillOrder(
            takerDigest,
            taker.order.sender,
            taker.order.priceX18,
            takerAmount,
            taker.order.expiration,
            taker.order.nonce,
            true,
            takerFee,
            takerAmountDelta,
            takerQuoteDelta
        );
        market.collectedFees = _market.collectedFees;
        market.sequencerFees = _market.sequencerFees;
        filledAmounts[takerDigest] = takerAmount - taker.order.amount;
    }

    function isHealthy(
        bytes32 /* subaccount */
    ) internal view virtual returns (bool) {
        return true;
    }

    function matchOrders(IEndpoint.MatchOrdersWithSigner calldata txn)
        external
        onlyEndpoint
    {
        Market memory _market = market;
        IEndpoint.SignedOrder memory taker = txn.matchOrders.taker;
        IEndpoint.SignedOrder memory maker = txn.matchOrders.maker;

        OrdersInfo memory ordersInfo = OrdersInfo({
            takerDigest: getDigest(taker.order),
            makerDigest: getDigest(maker.order),
            makerAmount: maker.order.amount
        });

        int128 takerAmount = taker.order.amount;

        require(
            _validateOrder(
                _market,
                taker,
                ordersInfo.takerDigest,
                txn.takerLinkedSigner
            ),
            ERR_INVALID_TAKER
        );
        require(
            _validateOrder(
                _market,
                maker,
                ordersInfo.makerDigest,
                txn.makerLinkedSigner
            ),
            ERR_INVALID_MAKER
        );

        // ensure orders are crossing
        require(
            (maker.order.amount > 0) != (taker.order.amount > 0),
            ERR_ORDERS_CANNOT_BE_MATCHED
        );
        if (maker.order.amount > 0) {
            require(
                maker.order.priceX18 >= taker.order.priceX18,
                ERR_ORDERS_CANNOT_BE_MATCHED
            );
        } else {
            require(
                maker.order.priceX18 <= taker.order.priceX18,
                ERR_ORDERS_CANNOT_BE_MATCHED
            );
        }

        bool isTakerFirst = _isTakerFirst(ordersInfo.takerDigest);

        (int128 takerAmountDelta, int128 takerQuoteDelta) = _matchOrderOrder(
            _market,
            taker.order,
            maker.order,
            ordersInfo
        );

        // apply the taker fee
        int128 takerFee;
        (takerFee, takerQuoteDelta) = feeAmount(
            taker.order.sender,
            _market,
            takerQuoteDelta,
            true,
            isTakerFirst
        );

        {
            IProductEngine.ProductDelta[]
                memory deltas = new IProductEngine.ProductDelta[](2);

            // taker
            deltas[0] = IProductEngine.ProductDelta({
                productId: _market.productId,
                subaccount: taker.order.sender,
                amountDelta: takerAmountDelta,
                vQuoteDelta: takerQuoteDelta
            });
            deltas[1] = IProductEngine.ProductDelta({
                productId: QUOTE_PRODUCT_ID,
                subaccount: taker.order.sender,
                amountDelta: takerQuoteDelta,
                vQuoteDelta: 0
            });

            engine.applyDeltas(deltas);
        }

        require(isHealthy(taker.order.sender), ERR_INVALID_TAKER);
        require(isHealthy(maker.order.sender), ERR_INVALID_MAKER);

        emit FillOrder(
            ordersInfo.takerDigest,
            txn.matchOrders.taker.order.sender,
            txn.matchOrders.taker.order.priceX18,
            takerAmount,
            txn.matchOrders.taker.order.expiration,
            txn.matchOrders.taker.order.nonce,
            true,
            takerFee,
            takerAmountDelta,
            takerQuoteDelta
        );

        market.collectedFees = _market.collectedFees;
        market.sequencerFees = _market.sequencerFees;
        filledAmounts[ordersInfo.takerDigest] =
            takerAmount -
            taker.order.amount;
        filledAmounts[ordersInfo.makerDigest] =
            ordersInfo.makerAmount -
            maker.order.amount;
    }

    function swapAMM(IEndpoint.SwapAMM calldata txn) external onlyEndpoint {
        Market memory _market = market;
        if (engine.getEngineType() == IProductEngine.EngineType.PERP) {
            require(
                txn.amount % _market.sizeIncrement == 0,
                ERR_INVALID_SWAP_PARAMS
            );
        }

        (int128 takerAmountDelta, int128 takerQuoteDelta) = engine.swapLp(
            _market.productId,
            txn.amount,
            txn.priceX18,
            _market.sizeIncrement,
            _market.lpSpreadX18
        );
        takerAmountDelta = -takerAmountDelta;
        takerQuoteDelta = -takerQuoteDelta;

        int128 takerFee;
        (takerFee, takerQuoteDelta) = feeAmount(
            txn.sender,
            _market,
            takerQuoteDelta,
            true,
            false
        );

        {
            IProductEngine.ProductDelta[]
                memory deltas = new IProductEngine.ProductDelta[](2);

            // taker
            deltas[0] = IProductEngine.ProductDelta({
                productId: _market.productId,
                subaccount: txn.sender,
                amountDelta: takerAmountDelta,
                vQuoteDelta: takerQuoteDelta
            });
            deltas[1] = IProductEngine.ProductDelta({
                productId: QUOTE_PRODUCT_ID,
                subaccount: txn.sender,
                amountDelta: takerQuoteDelta,
                vQuoteDelta: 0
            });

            engine.applyDeltas(deltas);
        }
        require(
            clearinghouse.getHealth(
                txn.sender,
                IProductEngine.HealthType.INITIAL
            ) >= 0,
            ERR_INVALID_TAKER
        );
        market.collectedFees = _market.collectedFees;
        market.sequencerFees = _market.sequencerFees;
    }

    function dumpFees() external onlyEndpoint {
        IProductEngine.ProductDelta[]
            memory feeAccDeltas = new IProductEngine.ProductDelta[](1);
        int128 feesAmount = market.collectedFees;
        // https://en.wikipedia.org/wiki/Design_Patterns
        market.collectedFees = 0;

        if (engine.getEngineType() == IProductEngine.EngineType.SPOT) {
            feeAccDeltas[0] = IProductEngine.ProductDelta({
                productId: QUOTE_PRODUCT_ID,
                subaccount: FEES_ACCOUNT,
                amountDelta: feesAmount,
                vQuoteDelta: 0
            });
        } else {
            feeAccDeltas[0] = IProductEngine.ProductDelta({
                productId: market.productId,
                subaccount: FEES_ACCOUNT,
                amountDelta: 0,
                vQuoteDelta: feesAmount
            });
        }

        engine.applyDeltas(feeAccDeltas);
    }

    function claimSequencerFee() external returns (int128 feesAmount) {
        require(
            msg.sender == address(clearinghouse),
            "Only the clearinghouse can claim sequencer fee"
        );
        feesAmount = market.sequencerFees;
        market.sequencerFees = 0;
    }

    function getMarket() external view returns (Market memory) {
        return market;
    }
}
