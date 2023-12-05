// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "./interfaces/IEndpoint.sol";
import "./interfaces/clearinghouse/IClearinghouse.sol";
import "./interfaces/IOffchainBook.sol";
import "./EndpointGated.sol";
import "./common/Errors.sol";
import "./libraries/ERC20Helper.sol";
import "./interfaces/IEndpoint.sol";
import "./libraries/Logger.sol";
import "./interfaces/engine/ISpotEngine.sol";
import "./interfaces/engine/IPerpEngine.sol";
import "./interfaces/IERC20Base.sol";
import "./Version.sol";

interface ISanctionsList {
    function isSanctioned(address addr) external view returns (bool);
}

contract Endpoint is IEndpoint, EIP712Upgradeable, OwnableUpgradeable, Version {
    using ERC20Helper for IERC20Base;

    IERC20Base private quote;
    IClearinghouse public clearinghouse;
    ISpotEngine private spotEngine;
    IPerpEngine private perpEngine;
    ISanctionsList private sanctions;

    address sequencer;
    int128 public sequencerFees;

    mapping(bytes32 => uint64) subaccountIds;
    mapping(uint64 => bytes32) subaccounts;
    uint64 numSubaccounts;

    // healthGroup -> (spotPriceX18, perpPriceX18)
    mapping(uint32 => Prices) pricesX18;
    mapping(uint32 => address) books;
    mapping(address => uint64) nonces;

    uint64 public nSubmissions;

    SlowModeConfig public slowModeConfig;
    mapping(uint64 => SlowModeTx) public slowModeTxs;

    struct Times {
        uint128 perpTime;
        uint128 spotTime;
    }

    Times private times;

    mapping(uint32 => int128) public sequencerFee;

    mapping(bytes32 => address) linkedSigners;

    int128 private slowModeFees;

    // invitee -> referralCode
    mapping(address => string) public referralCodes;

    // address -> whether can call `BurnLpAndTransfer`.
    mapping(address => bool) transferableWallets;

    string constant LIQUIDATE_SUBACCOUNT_SIGNATURE =
        "LiquidateSubaccount(bytes32 sender,bytes32 liquidatee,uint8 mode,uint32 healthGroup,int128 amount,uint64 nonce)";
    string constant WITHDRAW_COLLATERAL_SIGNATURE =
        "WithdrawCollateral(bytes32 sender,uint32 productId,uint128 amount,uint64 nonce)";
    string constant MINT_LP_SIGNATURE =
        "MintLp(bytes32 sender,uint32 productId,uint128 amountBase,uint128 quoteAmountLow,uint128 quoteAmountHigh,uint64 nonce)";
    string constant BURN_LP_SIGNATURE =
        "BurnLp(bytes32 sender,uint32 productId,uint128 amount,uint64 nonce)";
    string constant LINK_SIGNER_SIGNATURE =
        "LinkSigner(bytes32 sender,bytes32 signer,uint64 nonce)";

    function initialize(
        address _sanctions,
        address _sequencer,
        IClearinghouse _clearinghouse,
        uint64 slowModeTimeout,
        uint128 _time,
        int128[] memory _prices
    ) external initializer {
        __Ownable_init();
        __EIP712_init("Vertex", "0.0.1");
        sequencer = _sequencer;
        clearinghouse = _clearinghouse;
        sanctions = ISanctionsList(_sanctions);
        spotEngine = ISpotEngine(
            clearinghouse.getEngineByType(IProductEngine.EngineType.SPOT)
        );

        perpEngine = IPerpEngine(
            clearinghouse.getEngineByType(IProductEngine.EngineType.PERP)
        );

        quote = IERC20Base(clearinghouse.getQuote());

        slowModeConfig = SlowModeConfig({
            timeout: slowModeTimeout,
            txCount: 0,
            txUpTo: 0
        });
        times = Times({perpTime: _time, spotTime: _time});
        for (uint32 i = 0; i < _prices.length; i += 2) {
            pricesX18[i / 2].spotPriceX18 = _prices[i];
            pricesX18[i / 2].perpPriceX18 = _prices[i + 1];
        }
    }

    // NOTE: we want DepositCollateral to be the first action anybody takes on Vertex
    // so we can record the existence of their subaccount on-chain
    // unfortunately, there are some edge cases where an empty account can place an order
    // or do an AMM swap that passes health checks without going through a deposit, so
    // we block those functions unless there has been a deposit first
    function _recordSubaccount(bytes32 subaccount) internal {
        if (subaccountIds[subaccount] == 0) {
            subaccountIds[subaccount] = ++numSubaccounts;
            subaccounts[numSubaccounts] = subaccount;
        }
    }

    function requireSubaccount(bytes32 subaccount) public view {
        require(subaccountIds[subaccount] != 0, ERR_REQUIRES_DEPOSIT);
    }

    function validateNonce(bytes32 sender, uint64 nonce) internal virtual {
        require(
            nonce == nonces[address(uint160(bytes20(sender)))]++,
            ERR_WRONG_NONCE
        );
    }

    function chargeFee(bytes32 sender, int128 fee) internal {
        chargeFee(sender, fee, QUOTE_PRODUCT_ID);
    }

    function chargeFee(
        bytes32 sender,
        int128 fee,
        uint32 productId
    ) internal {
        IProductEngine.ProductDelta[]
            memory deltas = IProductEngine.ProductDelta[](
                new IProductEngine.ProductDelta[](1)
            );

        deltas[0] = IProductEngine.ProductDelta({
            productId: productId,
            subaccount: sender,
            amountDelta: -fee,
            vQuoteDelta: 0
        });

        sequencerFee[productId] += fee;
        spotEngine.applyDeltas(deltas);
    }

    function validateSignature(
        bytes32 sender,
        bytes32 digest,
        bytes memory signature
    ) internal view virtual {
        address recovered = ECDSA.recover(digest, signature);
        require(
            (recovered != address(0)) &&
                ((recovered == address(uint160(bytes20(sender)))) ||
                    (recovered == linkedSigners[sender])),
            ERR_INVALID_SIGNATURE
        );
    }

    function increaseAllowance(
        IERC20Base token,
        address to,
        uint256 amount
    ) internal virtual {
        token.increaseAllowance(to, amount);
    }

    function safeTransferFrom(
        IERC20Base token,
        address from,
        uint256 amount
    ) internal virtual {
        token.safeTransferFrom(from, address(this), amount);
    }

    function handleDepositTransfer(
        IERC20Base token,
        address from,
        uint256 amount
    ) internal {
        increaseAllowance(token, address(clearinghouse), amount);
        safeTransferFrom(token, from, amount);
    }

    function validateSender(bytes32 txSender, address sender) internal view {
        require(
            address(uint160(bytes20(txSender))) == sender ||
                sender == address(this),
            ERR_SLOW_MODE_WRONG_SENDER
        );
    }

    function setReferralCode(address sender, string memory referralCode)
        internal
    {
        if (bytes(referralCodes[sender]).length == 0) {
            referralCodes[sender] = referralCode;
        }
    }

    function depositCollateral(
        bytes12 subaccountName,
        uint32 productId,
        uint128 amount
    ) external {
        depositCollateralWithReferral(
            bytes32(abi.encodePacked(msg.sender, subaccountName)),
            productId,
            amount,
            DEFAULT_REFERRAL_CODE
        );
    }

    function depositCollateralWithReferral(
        bytes12 subaccountName,
        uint32 productId,
        uint128 amount,
        string calldata referralCode
    ) external {
        depositCollateralWithReferral(
            bytes32(abi.encodePacked(msg.sender, subaccountName)),
            productId,
            amount,
            referralCode
        );
    }

    function depositCollateralWithReferral(
        bytes32 subaccount,
        uint32 productId,
        uint128 amount,
        string memory referralCode
    ) public {
        require(bytes(referralCode).length != 0, ERR_INVALID_REFERRAL_CODE);

        address sender = address(bytes20(subaccount));

        // depositor / depositee need to be unsanctioned
        requireUnsanctioned(msg.sender);
        requireUnsanctioned(sender);

        // no referral code allowed for remote deposit
        setReferralCode(
            sender,
            sender == msg.sender ? referralCode : DEFAULT_REFERRAL_CODE
        );

        IERC20Base token = IERC20Base(spotEngine.getConfig(productId).token);
        require(address(token) != address(0));
        handleDepositTransfer(token, msg.sender, uint256(amount));

        // copy from submitSlowModeTransaction
        SlowModeConfig memory _slowModeConfig = slowModeConfig;

        // hardcoded to three days
        uint64 executableAt = uint64(block.timestamp) + 259200;
        slowModeTxs[_slowModeConfig.txCount++] = SlowModeTx({
            executableAt: executableAt,
            sender: sender,
            tx: abi.encodePacked(
                uint8(TransactionType.DepositCollateral),
                abi.encode(
                    DepositCollateral({
                        sender: subaccount,
                        productId: productId,
                        amount: amount
                    })
                )
            )
        });
        slowModeConfig = _slowModeConfig;
    }

    function requireUnsanctioned(address sender) internal view virtual {
        require(!sanctions.isSanctioned(sender), ERR_WALLET_SANCTIONED);
    }

    function submitSlowModeTransaction(bytes calldata transaction) external {
        TransactionType txType = TransactionType(uint8(transaction[0]));

        // special case for DepositCollateral because upon
        // slow mode submission we must take custody of the
        // actual funds

        address sender = msg.sender;

        if (txType == TransactionType.DepositCollateral) {
            revert();
        } else if (txType == TransactionType.DepositInsurance) {
            DepositInsurance memory txn = abi.decode(
                transaction[1:],
                (DepositInsurance)
            );
            IERC20Base token = IERC20Base(clearinghouse.getQuote());
            require(address(token) != address(0));
            handleDepositTransfer(token, sender, uint256(txn.amount));
        } else if (txType == TransactionType.UpdateProduct) {
            require(sender == owner());
        } else if (txType == TransactionType.BurnLpAndTransfer) {
            require(transferableWallets[sender], ERR_WALLET_NOT_TRANSFERABLE);
        } else {
            safeTransferFrom(quote, sender, uint256(int256(SLOW_MODE_FEE)));
            slowModeFees += SLOW_MODE_FEE;
        }

        SlowModeConfig memory _slowModeConfig = slowModeConfig;
        // hardcoded to three days
        uint64 executableAt = uint64(block.timestamp) + 259200;
        requireUnsanctioned(sender);
        slowModeTxs[_slowModeConfig.txCount++] = SlowModeTx({
            executableAt: executableAt,
            sender: sender,
            tx: transaction
        });
        // TODO: to save on costs we could potentially just emit something
        // for now, we can just create a separate loop in the engine that queries the remote
        // sequencer for slow mode transactions, and ignore the possibility of a reorgy attack
        slowModeConfig = _slowModeConfig;
    }

    function _executeSlowModeTransaction(
        SlowModeConfig memory _slowModeConfig,
        bool fromSequencer
    ) internal {
        require(
            _slowModeConfig.txUpTo < _slowModeConfig.txCount,
            ERR_NO_SLOW_MODE_TXS_REMAINING
        );
        SlowModeTx memory txn = slowModeTxs[_slowModeConfig.txUpTo];
        delete slowModeTxs[_slowModeConfig.txUpTo++];

        require(
            fromSequencer || (txn.executableAt <= block.timestamp),
            ERR_SLOW_TX_TOO_RECENT
        );

        uint256 gasRemaining = gasleft();
        try this.processSlowModeTransaction(txn.sender, txn.tx) {} catch {
            // we need to differentiate between a revert and an out of gas
            // the expectation is that because 63/64 * gasRemaining is forwarded
            // we should be able to differentiate based on whether
            // gasleft() >= gasRemaining / 64. however, experimentally
            // even more gas can be remaining, and i don't have a clear
            // understanding as to why. as a result we just err on the
            // conservative side and provide two conservative
            // asserts that should cover all cases at the expense of needing
            // to provide a higher gas limit than necessary

            if (gasleft() <= 100000 || gasleft() <= gasRemaining / 16) {
                assembly {
                    invalid()
                }
            }

            // try return funds now removed
        }
    }

    function executeSlowModeTransactions(uint32 count) external {
        SlowModeConfig memory _slowModeConfig = slowModeConfig;
        require(
            count <= _slowModeConfig.txCount - _slowModeConfig.txUpTo,
            ERR_INVALID_COUNT
        );

        while (count > 0) {
            _executeSlowModeTransaction(_slowModeConfig, false);
            --count;
        }
        slowModeConfig = _slowModeConfig;
    }

    // TODO: these do not need senders or nonces
    // we can save some gas by creating new structs
    function processSlowModeTransaction(
        address sender,
        bytes calldata transaction
    ) public {
        require(msg.sender == address(this));
        TransactionType txType = TransactionType(uint8(transaction[0]));
        if (txType == TransactionType.LiquidateSubaccount) {
            LiquidateSubaccount memory txn = abi.decode(
                transaction[1:],
                (LiquidateSubaccount)
            );
            validateSender(txn.sender, sender);
            requireSubaccount(txn.sender);
            clearinghouse.liquidateSubaccount(txn);
        } else if (txType == TransactionType.DepositCollateral) {
            DepositCollateral memory txn = abi.decode(
                transaction[1:],
                (DepositCollateral)
            );
            validateSender(txn.sender, sender);
            _recordSubaccount(txn.sender);
            clearinghouse.depositCollateral(txn);
        } else if (txType == TransactionType.WithdrawCollateral) {
            WithdrawCollateral memory txn = abi.decode(
                transaction[1:],
                (WithdrawCollateral)
            );
            validateSender(txn.sender, sender);
            clearinghouse.withdrawCollateral(txn);
        } else if (txType == TransactionType.SettlePnl) {
            SettlePnl memory txn = abi.decode(transaction[1:], (SettlePnl));
            clearinghouse.settlePnl(txn);
        } else if (txType == TransactionType.DepositInsurance) {
            DepositInsurance memory txn = abi.decode(
                transaction[1:],
                (DepositInsurance)
            );
            clearinghouse.depositInsurance(txn);
        } else if (txType == TransactionType.MintLp) {
            MintLp memory txn = abi.decode(transaction[1:], (MintLp));
            validateSender(txn.sender, sender);
            clearinghouse.mintLpSlowMode(txn);
        } else if (txType == TransactionType.BurnLp) {
            BurnLp memory txn = abi.decode(transaction[1:], (BurnLp));
            validateSender(txn.sender, sender);
            clearinghouse.burnLp(txn);
        } else if (txType == TransactionType.SwapAMM) {
            SwapAMM memory txn = abi.decode(transaction[1:], (SwapAMM));
            validateSender(txn.sender, sender);
            requireSubaccount(txn.sender);
            IOffchainBook(books[txn.productId]).swapAMM(txn);
        } else if (txType == TransactionType.UpdateProduct) {
            UpdateProduct memory txn = abi.decode(
                transaction[1:],
                (UpdateProduct)
            );
            IProductEngine(txn.engine).updateProduct(txn.tx);
        } else if (txType == TransactionType.LinkSigner) {
            LinkSigner memory txn = abi.decode(transaction[1:], (LinkSigner));
            validateSender(txn.sender, sender);
            linkedSigners[txn.sender] = address(uint160(bytes20(txn.signer)));
        } else if (txType == TransactionType.BurnLpAndTransfer) {
            BurnLpAndTransfer memory txn = abi.decode(
                transaction[1:],
                (BurnLpAndTransfer)
            );
            validateSender(txn.sender, sender);
            _recordSubaccount(txn.recipient);
            clearinghouse.burnLpAndTransfer(txn);
        } else {
            revert();
        }
    }

    function processTransaction(bytes calldata transaction) internal {
        TransactionType txType = TransactionType(uint8(transaction[0]));
        if (txType == TransactionType.LiquidateSubaccount) {
            SignedLiquidateSubaccount memory signedTx = abi.decode(
                transaction[1:],
                (SignedLiquidateSubaccount)
            );
            validateNonce(signedTx.tx.sender, signedTx.tx.nonce);
            bytes32 digest = _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(bytes(LIQUIDATE_SUBACCOUNT_SIGNATURE)),
                        signedTx.tx.sender,
                        signedTx.tx.liquidatee,
                        signedTx.tx.mode,
                        signedTx.tx.healthGroup,
                        signedTx.tx.amount,
                        signedTx.tx.nonce
                    )
                )
            );
            validateSignature(signedTx.tx.sender, digest, signedTx.signature);
            requireSubaccount(signedTx.tx.sender);
            chargeFee(signedTx.tx.sender, LIQUIDATION_FEE);
            clearinghouse.liquidateSubaccount(signedTx.tx);
        } else if (txType == TransactionType.WithdrawCollateral) {
            SignedWithdrawCollateral memory signedTx = abi.decode(
                transaction[1:],
                (SignedWithdrawCollateral)
            );
            validateNonce(signedTx.tx.sender, signedTx.tx.nonce);
            bytes32 digest = _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(bytes(WITHDRAW_COLLATERAL_SIGNATURE)),
                        signedTx.tx.sender,
                        signedTx.tx.productId,
                        signedTx.tx.amount,
                        signedTx.tx.nonce
                    )
                )
            );
            validateSignature(signedTx.tx.sender, digest, signedTx.signature);
            chargeFee(
                signedTx.tx.sender,
                spotEngine.getWithdrawFee(signedTx.tx.productId),
                signedTx.tx.productId
            );
            clearinghouse.withdrawCollateral(signedTx.tx);
        } else if (txType == TransactionType.SpotTick) {
            SpotTick memory txn = abi.decode(transaction[1:], (SpotTick));
            Times memory t = times;
            uint128 dt = txn.time - t.spotTime;
            spotEngine.updateStates(dt);
            t.spotTime = txn.time;
            times = t;
        } else if (txType == TransactionType.PerpTick) {
            PerpTick memory txn = abi.decode(transaction[1:], (PerpTick));
            Times memory t = times;
            uint128 dt = txn.time - t.perpTime;
            perpEngine.updateStates(dt, txn.avgPriceDiffs);
            t.perpTime = txn.time;
            times = t;
        } else if (txType == TransactionType.UpdatePrice) {
            UpdatePrice memory txn = abi.decode(transaction[1:], (UpdatePrice));
            require(txn.priceX18 > 0, ERR_INVALID_PRICE);
            uint32 healthGroup = _getHealthGroup(txn.productId);
            if (txn.productId % 2 == 1) {
                pricesX18[healthGroup].spotPriceX18 = txn.priceX18;
            } else {
                pricesX18[healthGroup].perpPriceX18 = txn.priceX18;
            }
        } else if (txType == TransactionType.SettlePnl) {
            SettlePnl memory txn = abi.decode(transaction[1:], (SettlePnl));
            clearinghouse.settlePnl(txn);
        } else if (txType == TransactionType.MatchOrders) {
            MatchOrders memory txn = abi.decode(transaction[1:], (MatchOrders));
            requireSubaccount(txn.taker.order.sender);
            requireSubaccount(txn.maker.order.sender);
            MatchOrdersWithSigner memory txnWithSigner = MatchOrdersWithSigner({
                matchOrders: txn,
                takerLinkedSigner: linkedSigners[txn.taker.order.sender],
                makerLinkedSigner: linkedSigners[txn.maker.order.sender]
            });
            IOffchainBook(books[txn.productId]).matchOrders(txnWithSigner);
        } else if (txType == TransactionType.MatchOrderAMM) {
            MatchOrderAMM memory txn = abi.decode(
                transaction[1:],
                (MatchOrderAMM)
            );
            requireSubaccount(txn.taker.order.sender);
            IOffchainBook(books[txn.productId]).matchOrderAMM(
                txn,
                linkedSigners[txn.taker.order.sender]
            );
        } else if (txType == TransactionType.ExecuteSlowMode) {
            SlowModeConfig memory _slowModeConfig = slowModeConfig;
            _executeSlowModeTransaction(_slowModeConfig, true);
            slowModeConfig = _slowModeConfig;
        } else if (txType == TransactionType.MintLp) {
            SignedMintLp memory signedTx = abi.decode(
                transaction[1:],
                (SignedMintLp)
            );
            validateNonce(signedTx.tx.sender, signedTx.tx.nonce);
            bytes32 digest = _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(bytes(MINT_LP_SIGNATURE)),
                        signedTx.tx.sender,
                        signedTx.tx.productId,
                        signedTx.tx.amountBase,
                        signedTx.tx.quoteAmountLow,
                        signedTx.tx.quoteAmountHigh,
                        signedTx.tx.nonce
                    )
                )
            );
            validateSignature(signedTx.tx.sender, digest, signedTx.signature);
            chargeFee(signedTx.tx.sender, HEALTHCHECK_FEE);
            clearinghouse.mintLp(signedTx.tx);
        } else if (txType == TransactionType.BurnLp) {
            SignedBurnLp memory signedTx = abi.decode(
                transaction[1:],
                (SignedBurnLp)
            );
            validateNonce(signedTx.tx.sender, signedTx.tx.nonce);
            bytes32 digest = _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(bytes(BURN_LP_SIGNATURE)),
                        signedTx.tx.sender,
                        signedTx.tx.productId,
                        signedTx.tx.amount,
                        signedTx.tx.nonce
                    )
                )
            );
            validateSignature(signedTx.tx.sender, digest, signedTx.signature);
            chargeFee(signedTx.tx.sender, HEALTHCHECK_FEE);
            clearinghouse.burnLp(signedTx.tx);
        } else if (txType == TransactionType.DumpFees) {
            uint32 numProducts = clearinghouse.getNumProducts();
            for (uint32 i = 1; i < numProducts; i++) {
                IOffchainBook(books[i]).dumpFees();
            }
        } else if (txType == TransactionType.ClaimSequencerFees) {
            ClaimSequencerFees memory txn = abi.decode(
                transaction[1:],
                (ClaimSequencerFees)
            );
            uint32[] memory spotIds = spotEngine.getProductIds();
            int128[] memory fees = new int128[](spotIds.length);
            for (uint256 i = 0; i < spotIds.length; i++) {
                fees[i] = sequencerFee[spotIds[i]];
                sequencerFee[spotIds[i]] = 0;
            }
            clearinghouse.claimSequencerFees(txn, fees);
        } else if (txType == TransactionType.ManualAssert) {
            ManualAssert memory txn = abi.decode(
                transaction[1:],
                (ManualAssert)
            );
            perpEngine.manualAssert(txn.openInterests);
            spotEngine.manualAssert(txn.totalDeposits, txn.totalBorrows);
        } else if (txType == TransactionType.Rebate) {
            // deprecated.
        } else if (txType == TransactionType.LinkSigner) {
            SignedLinkSigner memory signedTx = abi.decode(
                transaction[1:],
                (SignedLinkSigner)
            );
            validateNonce(signedTx.tx.sender, signedTx.tx.nonce);
            bytes32 digest = _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(bytes(LINK_SIGNER_SIGNATURE)),
                        signedTx.tx.sender,
                        signedTx.tx.signer,
                        signedTx.tx.nonce
                    )
                )
            );
            validateSignature(signedTx.tx.sender, digest, signedTx.signature);
            linkedSigners[signedTx.tx.sender] = address(
                uint160(bytes20(signedTx.tx.signer))
            );
        } else if (txType == TransactionType.UpdateFeeRates) {
            UpdateFeeRates memory txn = abi.decode(
                transaction[1:],
                (UpdateFeeRates)
            );
            clearinghouse.updateFeeRates(txn);
        } else {
            revert();
        }
    }

    function requireSequencer() internal view virtual {
        require(msg.sender == sequencer);
    }

    function submitTransactions(bytes[] calldata transactions) public {
        requireSequencer();
        for (uint128 i = 0; i < transactions.length; i++) {
            bytes calldata transaction = transactions[i];
            processTransaction(transaction);
        }
        nSubmissions += uint64(transactions.length);
        emit SubmitTransactions();
    }

    function submitTransactionsChecked(
        uint64 idx,
        bytes[] calldata transactions
    ) external {
        requireSequencer();
        require(idx == nSubmissions, ERR_INVALID_SUBMISSION_INDEX);
        // TODO: if one of these transactions fails this means the sequencer is in an error state
        // we should probably record this, and engage some sort of recovery mode
        submitTransactions(transactions);
    }

    function submitTransactionsCheckedWithGasLimit(
        uint64 idx,
        bytes[] calldata transactions,
        uint256 gasLimit
    ) external returns (uint64, uint256) {
        uint256 gasUsed = gasleft();
        requireSequencer();
        require(idx == nSubmissions, ERR_INVALID_SUBMISSION_INDEX);
        for (uint128 i = 0; i < transactions.length; i++) {
            bytes calldata transaction = transactions[i];
            processTransaction(transaction);
            if (gasUsed - gasleft() > gasLimit) {
                return (uint64(i), gasUsed - gasleft());
            }
        }
        return (uint64(transactions.length), gasUsed - gasleft());
    }

    function setBook(uint32 productId, address book) external {
        require(
            msg.sender == address(clearinghouse),
            ERR_ONLY_CLEARINGHOUSE_CAN_SET_BOOK
        );
        books[productId] = book;
    }

    function getBook(uint32 productId) external view returns (address) {
        return books[productId];
    }

    function getSubaccountId(bytes32 subaccount)
        external
        view
        returns (uint64)
    {
        return subaccountIds[subaccount];
    }

    // this is enforced anywhere in addProduct, we generate productId in
    // the following way.
    function _getHealthGroup(uint32 productId) internal pure returns (uint32) {
        require(productId != 0, ERR_GETTING_ZERO_HEALTH_GROUP);
        return (productId - 1) / 2;
    }

    function getPriceX18(uint32 productId)
        public
        view
        returns (int128 priceX18)
    {
        uint32 healthGroup = _getHealthGroup(productId);
        if (productId % 2 == 1) {
            priceX18 = pricesX18[healthGroup].spotPriceX18;
        } else {
            priceX18 = pricesX18[healthGroup].perpPriceX18;
        }
        require(priceX18 != 0, ERR_INVALID_PRODUCT);
    }

    function getPricesX18(uint32 healthGroup)
        external
        view
        returns (Prices memory)
    {
        return pricesX18[healthGroup];
    }

    function getTime() external view returns (uint128) {
        Times memory t = times;
        uint128 _time = t.spotTime > t.perpTime ? t.spotTime : t.perpTime;
        require(_time != 0, ERR_INVALID_TIME);
        return _time;
    }

    function setSequencer(address _sequencer) external onlyOwner {
        sequencer = _sequencer;
    }

    function getSequencer() external view returns (address) {
        return sequencer;
    }

    function getNonce(address sender) external view returns (uint64) {
        return nonces[sender];
    }

    function registerTransferableWallet(address wallet, bool transferable)
        external
        onlyOwner
    {
        transferableWallets[wallet] = transferable;
    }
}
