// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./core/interfaces/IiZiSwapCallback.sol";
import "./core/interfaces/IiZiSwapFactory.sol";
import "./core/interfaces/IiZiSwapPool.sol";

import "./libraries/MulDivMath.sol";
import "./libraries/TwoPower.sol";
import "./libraries/LogPowMath.sol";
import "./libraries/Converter.sol";

import "./base/base.sol";
import "./base/Switch.sol";

contract LimitOrderWithSwapManager is Switch, Base, IiZiSwapAddLimOrderCallback, IiZiSwapCallback {

    /// @notice Emitted when user preswap AND SWAP OUT or do market swap before adding limit order
    /// @param tokenIn address of tokenIn (user payed to swap pool)
    /// @param tokenOut address of tokenOut (user acquired from swap pool)
    /// @param fee fee amount of swap pool
    /// @param amountIn amount of tokenIn during swap
    /// @param amountOut amount of tokenOut during swap
    event MarketSwap(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint128 amountIn,
        uint128 amountOut
    );

    /// @notice Emitted when user cancel a limit order
    /// @param tokenIn address of tokenIn (sell token)
    /// @param tokenOut address of tokenOut (earn token)
    /// @param fee fee amount of swap pool
    /// @param pt point(price) of limit order
    /// @param initAmountIn amount of tokenIn(sell token) at begining
    /// @param remainAmountIn remain amount of tokenIn(sell token) 
    /// @param amountOut amount of tokenOut(earn token) of this limit order
    event Cancel(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        int24 pt,
        uint128 initAmountIn,
        uint128 remainAmountIn,
        uint128 amountOut
    );

    /// @notice Emitted when user collect and finish a limit order
    /// @param tokenIn address of tokenIn (sell token)
    /// @param tokenOut address of tokenOut (earn token)
    /// @param fee fee amount of swap pool
    /// @param pt point(price) of limit order
    /// @param initAmountIn amount of tokenIn(sell token) at begining
    /// @param amountOut amount of tokenOut(earn token) of this limit order
    event Finish(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        int24 pt,
        uint128 initAmountIn,
        uint128 amountOut
    );


    // max-poolId in poolIds, poolId starts from 1
    uint128 private maxPoolId = 1;

    // owners of limit order
    mapping(uint256 =>address) public sellers;
    
    struct PoolMeta {
        address tokenX;
        address tokenY;
        uint24 fee;
    }

    // mapping from pool id to pool's meta info
    mapping(uint128 =>PoolMeta) public poolMetas;

    // mapping from pool id to pool address
    mapping(uint128 =>address) public poolAddrs;

    // mapping from pool address to poolid
    mapping(address =>uint128) public poolIds;

    // seller's active order id
    mapping(address => LimOrder[]) private addr2ActiveOrder;

    // callback data passed through iZiSwapPool#addLimOrderWithX(Y) to the callback
    struct LimCallbackData {
        // tokenX of swap pool
        address tokenX;
        // tokenY of swap pool
        address tokenY;
        // fee amount of swap pool
        uint24 fee;
        // the address who provides token to sell
        address payer;
    }

    // infomation of a limit order
    struct LimOrder {
        // total amount of earned token by all users at this point 
        // with same direction (sell x or sell y) as of the last update(add/dec)
        uint256 lastAccEarn;
        // initial amount of token on sale
        uint128 initSellingAmount;
        // remaing amount of token on sale
        uint128 sellingRemain;
        // total earned amount
        uint128 earn;
        // id of pool in which this liquidity is added
        uint128 poolId;
        // block.timestamp when add a limit order
        uint128 timestamp;
        // point (price) of limit order
        int24 pt;
        // direction of limit order (sellx or sell y)
        bool sellXEarnY;
        // active or not
        bool active;
    }

    modifier checkActive(uint256 lIdx) {
        require(addr2ActiveOrder[msg.sender].length > lIdx, 'Out Of Length!');
        require(addr2ActiveOrder[msg.sender][lIdx].active, 'Not Active!');
        _;
    }

    /// @notice Constructor to create this contract.
    /// @param factory address of iZiSwapFactory
    /// @param weth address of WETH token
    constructor( address factory, address weth ) Base(factory, weth) {}

    /// @notice Callback for add limit order, in order to deposit corresponding tokens
    /// @param x amount of tokenX need to pay from miner
    /// @param y amount of tokenY need to pay from miner
    /// @param data encoded LimCallbackData
    function payCallback(
        uint256 x,
        uint256 y,
        bytes calldata data
    ) external override notPause {
        LimCallbackData memory dt = abi.decode(data, (LimCallbackData));
        verify(dt.tokenX, dt.tokenY, dt.fee);
        if (x > 0) {
            pay(dt.tokenX, dt.payer, msg.sender, x);
        }
        if (y > 0) {
            pay(dt.tokenY, dt.payer, msg.sender, y);
        }
    }

    struct SwapCallbackData {
        address tokenX;
        address tokenY;
        uint24 fee;
        address payer;
    }

    /// @notice Callback for swapY2X and swapY2XDesireX, in order to pay tokenY from trader.
    /// @param x amount of tokenX trader acquired
    /// @param y amount of tokenY need to pay from trader
    /// @param data encoded SwapCallbackData
    function swapY2XCallback(
        uint256 x,
        uint256 y,
        bytes calldata data
    ) external override notPause {
        SwapCallbackData memory dt = abi.decode(data, (SwapCallbackData));
        verify(dt.tokenX, dt.tokenY, dt.fee);
        pay(dt.tokenY, dt.payer, msg.sender, y);
    }

    /// @notice Callback for swapX2Y and swapX2YDesireY, in order to pay tokenX from trader.
    /// @param x amount of tokenX need to pay from trader
    /// @param y amount of tokenY trader acquired
    /// @param data encoded SwapCallbackData
    function swapX2YCallback(
        uint256 x,
        uint256 y,
        bytes calldata data
    ) external override notPause {
        SwapCallbackData memory dt = abi.decode(data, (SwapCallbackData));
        verify(dt.tokenX, dt.tokenY, dt.fee);
        pay(dt.tokenX, dt.payer, msg.sender, x);
    }

    function limOrderKey(address miner, int24 pt) internal pure returns(bytes32) {
        return keccak256(abi.encodePacked(miner, pt));
    }

    function cachePoolKey(address pool, PoolMeta memory meta) private returns (uint128 poolId) {
        poolId = poolIds[pool];
        if (poolId == 0) {
            poolIds[pool] = (poolId = maxPoolId++);
            poolMetas[poolId] = meta;
            poolAddrs[poolId] = pool;
        }
    }

    function getEarnX(address pool, bytes32 key) private view returns(uint256, uint128, uint128) {
        (uint256 lastAccEarn, , , uint128 earn, uint128 legacyEarn, ) = IiZiSwapPool(pool).userEarnX(key);
        return (lastAccEarn, earn, legacyEarn);
    }

    function getEarnX(address pool, address miner, int24 pt) private view returns(uint256 accEarn, uint128 earn, uint128 legacyEarn) {
        (accEarn, earn, legacyEarn) = getEarnX(pool, limOrderKey(miner, pt));
    }

    function getEarnY(address pool, bytes32 key) private view returns(uint256, uint128, uint128) {
        (uint256 lastAccEarn, , , uint128 earn, uint128 legacyEarn, ) = IiZiSwapPool(pool).userEarnY(key);
        return (lastAccEarn, earn, legacyEarn);
    }

    function getEarnY(address pool, address miner, int24 pt) private view returns(uint256 accEarn, uint128 earn, uint128 legacyEarn) {
        (accEarn, earn, legacyEarn) = getEarnY(pool, limOrderKey(miner, pt));
    }

    function getEarn(address pool, address miner, int24 pt, bool sellXEarnY) private view returns(uint256 accEarn, uint128 earn, uint128 legacyEarn) {
        if (sellXEarnY) {
            (accEarn, earn, legacyEarn) = getEarnY(pool, limOrderKey(miner, pt));
        } else {
            (accEarn, earn, legacyEarn) = getEarnX(pool, limOrderKey(miner, pt));
        }
    }

    /// parameters when calling newLimOrder, grouped together to avoid stake too deep
    struct AddLimOrderParam {
        // recipient to acquire token during pre-swap
        // if and only if user acquire chain token token (like eth/bnb, and not in wrapped form),
        //     address should be 0, and user should append a unwrapWETH9(...) calling immediately 
        //     (via multicall)
        address recipient;
        // tokenX of swap pool
        address tokenX;
        // tokenY of swap pool
        address tokenY;
        // fee amount of swap pool
        uint24 fee;
        // on which point to add limit order
        int24 pt;

        bool isDesireMode;
        // amount of token to sell/acquire
        // if isDesireMode is true, acquire amount
        // otherwise, sell amount
        uint128 amount;
        uint256 swapMinAcquired;
        // sell tokenX or sell tokenY
        bool sellXEarnY;

        uint256 deadline;
    }

    function _addLimOrder(
        address pool, AddLimOrderParam memory addLimitOrderParam
    ) private returns (uint128 order, uint128 acquire) {
        if (addLimitOrderParam.sellXEarnY) {
            (order, acquire) = IiZiSwapPool(pool).addLimOrderWithX(
                address(this), addLimitOrderParam.pt, addLimitOrderParam.amount,
                abi.encode(LimCallbackData({tokenX: addLimitOrderParam.tokenX, tokenY: addLimitOrderParam.tokenY, fee: addLimitOrderParam.fee, payer: msg.sender}))
            );
        } else {
            (order, acquire) = IiZiSwapPool(pool).addLimOrderWithY(
                address(this), addLimitOrderParam.pt, addLimitOrderParam.amount,
                abi.encode(LimCallbackData({tokenX: addLimitOrderParam.tokenX, tokenY: addLimitOrderParam.tokenY, fee: addLimitOrderParam.fee, payer: msg.sender}))
            );
        }
        if (acquire > 0) {
            IiZiSwapPool(pool).collectLimOrder(addLimitOrderParam.recipient, addLimitOrderParam.pt, 0, acquire, addLimitOrderParam.sellXEarnY);
        }
    }

    struct SwapBeforeResult {
        uint128 remainAmount;
        uint128 costBeforeSwap;
        uint128 acquireBeforeSwap;
        bool swapOut;
    }

    function _swapBefore(
        address pool,
        AddLimOrderParam memory addLimitOrderParam
    ) private returns (SwapBeforeResult memory) {
        address recipient = addLimitOrderParam.recipient;
        SwapBeforeResult memory result = SwapBeforeResult({
            remainAmount: 0,
            costBeforeSwap: 0,
            acquireBeforeSwap: 0,
            swapOut: false
        });
        result.remainAmount = addLimitOrderParam.amount;
        (
            ,
            int24 currentPoint,
            ,
            ,
            ,
            ,
            ,
        ) = IiZiSwapPool(pool).state();
        if (addLimitOrderParam.sellXEarnY) {
            if (addLimitOrderParam.pt < currentPoint) {
                uint256 costX;
                uint256 acquireY;
                if (addLimitOrderParam.isDesireMode) {
                    (costX, acquireY) = IiZiSwapPool(pool).swapX2YDesireY(
                        recipient, addLimitOrderParam.amount, addLimitOrderParam.pt,
                        abi.encode(SwapCallbackData({
                            tokenX: addLimitOrderParam.tokenX, 
                            fee: addLimitOrderParam.fee, 
                            tokenY: addLimitOrderParam.tokenY, 
                            payer: msg.sender
                        }))
                    );
                    require(acquireY >= addLimitOrderParam.swapMinAcquired, "X2YDesireYAcquired");
                    result.remainAmount = acquireY < uint256(addLimitOrderParam.amount) ? addLimitOrderParam.amount - uint128(acquireY) : 0;
                } else {
                    (costX, acquireY) = IiZiSwapPool(pool).swapX2Y(
                        recipient, addLimitOrderParam.amount, addLimitOrderParam.pt,
                        abi.encode(SwapCallbackData({
                            tokenX: addLimitOrderParam.tokenX, 
                            fee: addLimitOrderParam.fee, 
                            tokenY: addLimitOrderParam.tokenY, 
                            payer: msg.sender
                        }))
                    );
                    require(acquireY >= addLimitOrderParam.swapMinAcquired, "X2YAcquired");
                    result.remainAmount = costX < uint256(addLimitOrderParam.amount) ? addLimitOrderParam.amount - uint128(costX) : 0;
                }
                result.acquireBeforeSwap = Converter.toUint128(acquireY);
                result.costBeforeSwap = Converter.toUint128(costX);
            }
        } else {
            if (addLimitOrderParam.pt > currentPoint) {
                uint256 costY;
                uint256 acquireX;
                if (addLimitOrderParam.isDesireMode) {
                    (acquireX, costY) = IiZiSwapPool(pool).swapY2XDesireX(
                        recipient, addLimitOrderParam.amount, addLimitOrderParam.pt + 1,
                        abi.encode(SwapCallbackData({
                            tokenX: addLimitOrderParam.tokenX, 
                            fee: addLimitOrderParam.fee, 
                            tokenY: addLimitOrderParam.tokenY, 
                            payer: msg.sender
                        }))
                    );
                    require(acquireX >= addLimitOrderParam.swapMinAcquired, "Y2XDesireXAcquired");
                    result.remainAmount = acquireX < uint256(addLimitOrderParam.amount) ? addLimitOrderParam.amount - uint128(acquireX) : 0;
                } else {
                    (acquireX, costY) = IiZiSwapPool(pool).swapY2X(
                        recipient, addLimitOrderParam.amount, addLimitOrderParam.pt + 1,
                        abi.encode(SwapCallbackData({
                            tokenX: addLimitOrderParam.tokenX, 
                            fee: addLimitOrderParam.fee, 
                            tokenY: addLimitOrderParam.tokenY, 
                            payer: msg.sender
                        }))
                    );
                    require(acquireX >= addLimitOrderParam.swapMinAcquired, "Y2XAcquired");
                    result.remainAmount = costY < uint256(addLimitOrderParam.amount) ? addLimitOrderParam.amount - uint128(costY) : 0;
                }
                result.acquireBeforeSwap = Converter.toUint128(acquireX);
                result.costBeforeSwap = Converter.toUint128(costY);
            }
        }
        result.swapOut = (result.remainAmount <= addLimitOrderParam.amount / 10000);
        return result;
    }

    /// @notice Create a limit order for recipient.
    /// @param idx slot in the addr2ActiveOrder[msg.sender]
    /// @param originAddLimitOrderParam describe params of added limit order, see AddLimOrderParam for more
    /// @return orderAmount actual amount of token added in limit order
    /// @return costBeforeSwap amount of token cost if we need to swap before add limit order
    /// @return acquireBeforeSwap amount of token acquired if we need to swap before add limit order
    /// @return acquire amount of token acquired if there is a limit order to sell the other token before adding
    function newLimOrder(
        uint256 idx,
        AddLimOrderParam calldata originAddLimitOrderParam
    ) external payable notPause checkDeadline(originAddLimitOrderParam.deadline) returns (uint128 orderAmount, uint128 costBeforeSwap, uint128 acquireBeforeSwap, uint128 acquire) {
        require(originAddLimitOrderParam.tokenX < originAddLimitOrderParam.tokenY, 'x<y');

        AddLimOrderParam memory addLimitOrderParam = originAddLimitOrderParam;

        addLimitOrderParam.recipient = addLimitOrderParam.recipient == address(0) ? address(this) : addLimitOrderParam.recipient;
        
        address pool = IiZiSwapFactory(factory).pool(addLimitOrderParam.tokenX, addLimitOrderParam.tokenY, addLimitOrderParam.fee);

        SwapBeforeResult memory swapBeforeResult = _swapBefore(pool, addLimitOrderParam);
        addLimitOrderParam.amount = swapBeforeResult.remainAmount;
        costBeforeSwap = swapBeforeResult.costBeforeSwap;
        acquireBeforeSwap = swapBeforeResult.acquireBeforeSwap;
        if (swapBeforeResult.swapOut) {
            // swap out
            emit MarketSwap(
                originAddLimitOrderParam.sellXEarnY ? originAddLimitOrderParam.tokenX : originAddLimitOrderParam.tokenY,
                originAddLimitOrderParam.sellXEarnY ? originAddLimitOrderParam.tokenY : originAddLimitOrderParam.tokenX,
                originAddLimitOrderParam.fee,
                costBeforeSwap,
                acquireBeforeSwap
            );
            return (0, costBeforeSwap, acquireBeforeSwap, 0);
        }
        if (addLimitOrderParam.isDesireMode) {
            // transform desire amount to sell amount
            uint160 sqrtPrice = LogPowMath.getSqrtPrice(addLimitOrderParam.pt);
            if (addLimitOrderParam.sellXEarnY) {
                uint256 l = MulDivMath.mulDivCeil(addLimitOrderParam.amount, TwoPower.pow96, sqrtPrice);
                addLimitOrderParam.amount = Converter.toUint128(MulDivMath.mulDivCeil(l, TwoPower.pow96, sqrtPrice));
            } else {
                uint256 l = MulDivMath.mulDivCeil(addLimitOrderParam.amount, sqrtPrice, TwoPower.pow96);
                addLimitOrderParam.amount = Converter.toUint128(MulDivMath.mulDivCeil(l, sqrtPrice, TwoPower.pow96));
            }
            if (msg.value > 0) {
                uint256 ethBalance = address(this).balance;
                if (addLimitOrderParam.amount > ethBalance) {
                    addLimitOrderParam.amount = uint128(ethBalance);
                }
            }
            // no need to write following line
            addLimitOrderParam.isDesireMode = false;
        }
        (orderAmount, acquire) = _addLimOrder(pool, addLimitOrderParam);
        if (orderAmount == 0) {
            // swap out
            emit MarketSwap(
                originAddLimitOrderParam.sellXEarnY ? originAddLimitOrderParam.tokenX : originAddLimitOrderParam.tokenY,
                originAddLimitOrderParam.sellXEarnY ? originAddLimitOrderParam.tokenY : originAddLimitOrderParam.tokenX,
                originAddLimitOrderParam.fee,
                costBeforeSwap + addLimitOrderParam.amount,
                acquireBeforeSwap + acquire
            );
            return (0, costBeforeSwap, acquireBeforeSwap, 0);
        }
        (uint256 accEarn, , ) = getEarn(pool, address(this), addLimitOrderParam.pt, addLimitOrderParam.sellXEarnY);
        uint128 poolId = cachePoolKey(pool, PoolMeta({tokenX: addLimitOrderParam.tokenX, tokenY: addLimitOrderParam.tokenY, fee: addLimitOrderParam.fee}));
        LimOrder[] storage limOrders = addr2ActiveOrder[msg.sender];
        if (idx < limOrders.length) {
            // replace
            require(limOrders[idx].active == false, 'active conflict!');
            limOrders[idx] = LimOrder({
                pt: addLimitOrderParam.pt,
                initSellingAmount: addLimitOrderParam.amount + costBeforeSwap,
                sellingRemain: orderAmount,
                earn: acquire + acquireBeforeSwap,
                lastAccEarn: accEarn,
                poolId: poolId,
                sellXEarnY: addLimitOrderParam.sellXEarnY,
                timestamp: uint128(block.timestamp),
                active: true
            });
        } else {
            limOrders.push(LimOrder({
                pt: addLimitOrderParam.pt,
                initSellingAmount: addLimitOrderParam.amount + costBeforeSwap,
                sellingRemain: orderAmount,
                earn: acquire + acquireBeforeSwap,
                lastAccEarn: accEarn,
                poolId: poolId,
                sellXEarnY: addLimitOrderParam.sellXEarnY,
                timestamp: uint128(block.timestamp),
                active: true
            }));
        }

    }

    /// @notice Compute max amount of earned token the seller can claim.
    /// @param lastAccEarn total amount of earned token of all users on this point before last update of this limit order
    /// @param accEarn total amount of earned token of all users on this point now
    /// @param earnRemain total amount of unclaimed earned token of all users on this point
    /// @return earnLim max amount of earned token the seller can claim
    function getEarnLim(uint256 lastAccEarn, uint256 accEarn, uint128 earnRemain) private pure returns(uint128 earnLim) {
        require(accEarn >= lastAccEarn, "AEO");
        uint256 earnLim256 = accEarn - lastAccEarn;
        if (earnLim256 > earnRemain) {
            earnLim256 = earnRemain;
        }
        earnLim = uint128(earnLim256);
    }

    /// @notice Compute amount of earned token and amount of sold token for a limit order as much as possible.
    /// @param sqrtPrice_96 a 96 bit fixpoint number to describe sqrt(price) of pool
    /// @param earnLim max amount of earned token computed by getEarnLim(...)
    /// @param sellingRemain amount of token before exchange in the limit order
    /// @param isEarnY direction of the limit order (sell Y or sell tokenY)
    /// @return earn amount of earned token this limit order can claim
    /// @return sold amount of sold token which will be minused from sellingRemain
    function getEarnSold(
        uint160 sqrtPrice_96,
        uint128 earnLim,
        uint128 sellingRemain,
        bool isEarnY
    ) private pure returns (uint128 earn, uint128 sold) {
        earn = earnLim;
        uint256 sold256;
        if (isEarnY) {
            uint256 l = MulDivMath.mulDivCeil(earn, TwoPower.pow96, sqrtPrice_96);
            sold256 = MulDivMath.mulDivCeil(l, TwoPower.pow96, sqrtPrice_96);
        } else {
            uint256 l = MulDivMath.mulDivCeil(earn, sqrtPrice_96, TwoPower.pow96);
            sold256 = MulDivMath.mulDivCeil(l, sqrtPrice_96, TwoPower.pow96);
        }
        if (sold256 > sellingRemain) {
            sold256 = sellingRemain;
            if (isEarnY) {
                uint256 l = MulDivMath.mulDivFloor(sold256, sqrtPrice_96, TwoPower.pow96);
                earn = uint128(MulDivMath.mulDivFloor(l, sqrtPrice_96, TwoPower.pow96));
            } else {
                uint256 l = MulDivMath.mulDivFloor(sold256, TwoPower.pow96, sqrtPrice_96);
                earn = uint128(MulDivMath.mulDivFloor(l, TwoPower.pow96, sqrtPrice_96));
            }
        }
        sold = uint128(sold256);
    }

    /// @notice Compute amount of earned token for a legacy order
    ///    an limit order we call it 'legacy' if it together with other limit order of same
    ///    direction and same point on the pool is cleared during one time of exchanging.
    ///    if an limit order is convinced to be 'legacy', we should mark it as 'sold out',
    ///    etc, transform all its remained selling token to earned token.
    /// @param sqrtPrice_96 a 96 bit fixpoint number to describe sqrt(price) of pool
    /// @param earnLim remained amount of legacy part of earnings from corresponding limit order in core contract
    ///    corresponding limit order is an aggregated limit order owned by this contract at same point
    /// @param sellingRemain amount of token before exchange in the limit order
    /// @param isEarnY direction of the limit order (sell Y or sell tokenY)
    /// @return earn amount of earned token this limit order can claim
    function getLegacyEarn(
        uint160 sqrtPrice_96,
        uint128 earnLim,
        uint128 sellingRemain,
        bool isEarnY
    ) private pure returns (uint128 earn) {
        uint256 sold256 = sellingRemain;
        if (isEarnY) {
            uint256 l = MulDivMath.mulDivFloor(sold256, sqrtPrice_96, TwoPower.pow96);
            earn = uint128(MulDivMath.mulDivFloor(l, sqrtPrice_96, TwoPower.pow96));
        } else {
            uint256 l = MulDivMath.mulDivFloor(sold256, TwoPower.pow96, sqrtPrice_96);
            earn = uint128(MulDivMath.mulDivFloor(l, TwoPower.pow96, sqrtPrice_96));
        }
        if (earn > earnLim) {
            earn = earnLim;
        }
    }

    /// @notice assign some amount of earned token from earnings of corresponding limit order in core contract
    ///    to current user (msg.sender)
    ///    corresponding limit order is an aggregated limit order owned by this contract at same point
    /// @param pool swap pool address
    /// @param pt point (price) of limit order
    /// @param amount amount of legacy or unlegacy earned token to assgin from core's aggregated limit order
    /// @param isEarnY direction of the limit order (sell Y or sell tokenY)
    /// @param fromLegacy true for legacy order false for unlegacy
    /// @return actualAssign actual earned token assgiend from core
    function assignLimOrderEarn(
        address pool, int24 pt, uint128 amount, bool isEarnY, bool fromLegacy
    ) private returns(uint128 actualAssign) {
        if (isEarnY) {
            actualAssign = IiZiSwapPool(pool).assignLimOrderEarnY(pt, amount, fromLegacy);
        } else {
            actualAssign = IiZiSwapPool(pool).assignLimOrderEarnX(pt, amount, fromLegacy);
        }
    }

    /// @notice Update a limit order to claim earned tokens as much as possible.
    /// @param order the order to update, see LimOrder for more
    /// @param pool address of swap pool
    /// @return earn amount of earned token this limit order can claim
    function _updateOrder(
        LimOrder storage order,
        address pool
    ) private returns (uint128 earn) {
        uint256 legacyAccEarn;
        if (order.sellXEarnY) {
            (, legacyAccEarn) = IiZiSwapPool(pool).decLimOrderWithX(order.pt, 0);
        } else {
            (, legacyAccEarn) = IiZiSwapPool(pool).decLimOrderWithY(order.pt, 0);
        }
        uint128 sold;
        uint160 sqrtPrice_96 = LogPowMath.getSqrtPrice(order.pt);
        (uint256 accEarn, uint128 earnLim, uint128 legacyEarnLim) = getEarn(pool, address(this), order.pt, order.sellXEarnY);
        if (order.lastAccEarn < legacyAccEarn) {
            earn = getLegacyEarn(sqrtPrice_96, legacyEarnLim, order.sellingRemain, order.sellXEarnY);
            earn = assignLimOrderEarn(pool, order.pt, earn, order.sellXEarnY, true);
            sold = order.sellingRemain;
            order.earn = order.earn + earn;
            order.sellingRemain = 0;
        } else {
            earnLim = getEarnLim(order.lastAccEarn, accEarn, earnLim);
            (earn, sold) = getEarnSold(sqrtPrice_96, earnLim, order.sellingRemain, order.sellXEarnY);
            earn = assignLimOrderEarn(pool, order.pt, earn, order.sellXEarnY, false);
            order.earn = order.earn + earn;
            order.sellingRemain = order.sellingRemain - sold;
        }
        order.lastAccEarn = accEarn;
    }

    /// @notice cancel a limit order
    /// @param recipient address to acquire canceled selling token and to acquire earned token
    /// @param orderIdx point of seller's limit order
    /// @param deadline deadline timestamp of transaction
    function cancel(
        address recipient,
        uint256 orderIdx,
        uint256 deadline
    ) external notPause checkActive(orderIdx) checkDeadline(deadline) {
        if (recipient == address(0)) {
            recipient = address(this);
        }
        LimOrder storage order = addr2ActiveOrder[msg.sender][orderIdx];

        address pool = poolAddrs[order.poolId];
        // update order first
        uint128 earn = _updateOrder(order, pool);
        uint128 actualDecrease = order.sellingRemain;
        bool sellXEarnY = order.sellXEarnY;
        if (actualDecrease > 0) {
            if (sellXEarnY) {
                IiZiSwapPool(pool).decLimOrderWithX(order.pt, actualDecrease);
            } else {
                IiZiSwapPool(pool).decLimOrderWithY(order.pt, actualDecrease);
            }
        }
        if (actualDecrease > 0 || earn > 0) {
            IiZiSwapPool(pool).collectLimOrder(recipient, order.pt, actualDecrease, earn, sellXEarnY);
        }

        PoolMeta memory poolMeta = poolMetas[order.poolId];

        emit Cancel(
            sellXEarnY? poolMeta.tokenX : poolMeta.tokenY,
            sellXEarnY? poolMeta.tokenY : poolMeta.tokenX,
            poolMeta.fee,
            order.pt,
            order.initSellingAmount,
            order.sellingRemain,
            order.earn
        );
        order.active = false;
    }

    /// @notice Collect earned token from an limit order
    /// @param recipient address to benefit
    /// @param orderIdx idx of limit order
    /// @return earn amount of token collected during this calling (not all earned token of this order)
    function collect(
        address recipient,
        uint256 orderIdx
    ) external notPause checkActive(orderIdx) returns (uint128 earn) {
        if (recipient == address(0)) {
            recipient = address(this);
        }
        LimOrder storage order = addr2ActiveOrder[msg.sender][orderIdx];
        address pool = poolAddrs[order.poolId];
        // update order first
        earn = _updateOrder(order, pool);

        bool noRemain = (order.sellingRemain == 0);
        if (order.sellingRemain > 0) {
            noRemain = (order.initSellingAmount / order.sellingRemain > 100000);
        }

        bool sellXEarnY = order.sellXEarnY;

        if (earn > 0) {
            IiZiSwapPool(pool).collectLimOrder(recipient, order.pt, 0, earn, sellXEarnY);
        }
        
        if (noRemain) {
            PoolMeta memory poolMeta = poolMetas[order.poolId];
            emit Finish(
                sellXEarnY? poolMeta.tokenX : poolMeta.tokenY,
                sellXEarnY? poolMeta.tokenY : poolMeta.tokenX,
                poolMeta.fee,
                order.pt,
                order.initSellingAmount,
                order.earn
            );
            order.active = false;
        }
    }

    /// @notice Returns active orders for the seller.
    /// @param user address of the seller
    /// @return activeIdx list of active order idx
    /// @return activeLimitOrder list of active order
    function getActiveOrders(address user)
        external
        view
        returns (uint256[] memory activeIdx, LimOrder[] memory activeLimitOrder)
    {
        uint256 activeNum = 0;
        uint256 length = addr2ActiveOrder[user].length;
        for (uint256 i = 0; i < length; i ++) {
            if (addr2ActiveOrder[user][i].active) {
                activeNum += 1;
            }
        }
        if (activeNum == 0) {
            return (activeIdx, activeLimitOrder);
        }
        activeIdx = new uint256[](activeNum);
        activeLimitOrder = new LimOrder[](activeNum);
        activeNum = 0;
        for (uint256 i = 0; i < length; i ++) {
            if (addr2ActiveOrder[user][i].active) {
                activeIdx[activeNum] = i;
                activeLimitOrder[activeNum] = addr2ActiveOrder[user][i];
                activeNum += 1;
            }
        }
        return (activeIdx, activeLimitOrder);
    }

    /// @notice Returns a single active order for the seller.
    /// @param user address of the seller
    /// @param idx index of the active order list
    /// @return limOrder the target active order
    function getActiveOrder(address user, uint256 idx) external view returns (LimOrder memory limOrder) {
        require(idx < addr2ActiveOrder[user].length, 'Out Of Length');
        return addr2ActiveOrder[user][idx];
    }

    /// @notice Returns a slot in the active order list, which can be replaced with a new order.
    /// @param user address of the seller
    /// @return slotIdx the first available slot index
    function getDeactiveSlot(address user) external view returns (uint256 slotIdx) {
        slotIdx = addr2ActiveOrder[user].length;
        for (uint256 i = 0; i < addr2ActiveOrder[user].length; i ++) {
            if (!addr2ActiveOrder[user][i].active) {
                return i;
            }
        }
        return slotIdx;
    }


    struct SwapParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        uint128 amount;
        uint128 minAcquiredOrMaxPayed;
        address recipient;
        uint256 deadline;
    }
    
    function swapDesireSingle(
        SwapParams calldata params
    ) external payable notPause checkDeadline(params.deadline) {
        // allow swapping to the router address with address 0
        address recipient = params.recipient == address(0) ? address(this) : params.recipient;
        address poolAddr = pool(params.tokenOut, params.tokenIn, params.fee);
        uint256 amountIn;
        uint256 amountOut;
        if (params.tokenOut < params.tokenIn) {
            // tokenOut is tokenX, tokenIn is tokenY
            // we should call y2XDesireX
            (amountOut, amountIn) = IiZiSwapPool(poolAddr).swapY2XDesireX(
                recipient, params.amount, 799999,
                abi.encode(SwapCallbackData({
                    tokenX: params.tokenOut, 
                    fee: params.fee, 
                    tokenY: params.tokenIn, 
                    payer: msg.sender
                }))
            );
            require (amountIn <= params.minAcquiredOrMaxPayed, "swapY2XDesireX payed too much");
        } else {
            // tokenOut is tokenY
            // tokenIn is tokenX
            (amountIn, amountOut) = IiZiSwapPool(poolAddr).swapX2YDesireY(
                recipient, params.amount, -799999,
                abi.encode(SwapCallbackData({
                    tokenX: params.tokenIn, 
                    fee: params.fee, 
                    tokenY: params.tokenOut, 
                    payer: msg.sender
                }))
            );
            require (amountIn <= params.minAcquiredOrMaxPayed, "swapX2YDesireY payed too much");
        }
        emit MarketSwap(params.tokenIn, params.tokenOut, params.fee, Converter.toUint128(amountIn), Converter.toUint128(amountOut));
    }

    function swapAmountSingle(
        SwapParams calldata params
    ) external payable notPause checkDeadline(params.deadline) {
        // allow swapping to the router address with address 0
        address recipient = params.recipient == address(0) ? address(this) : params.recipient;
        address poolAddr = pool(params.tokenOut, params.tokenIn, params.fee);
        uint256 amountIn;
        uint256 amountOut;
        if (params.tokenIn < params.tokenOut) {
            // swapX2Y
            (amountIn, amountOut) = IiZiSwapPool(poolAddr).swapX2Y(
                recipient, params.amount, -799999,
                abi.encode(SwapCallbackData({
                    tokenX: params.tokenIn, 
                    fee: params.fee, 
                    tokenY: params.tokenOut, 
                    payer: msg.sender
                }))
            );
            require (amountOut >= params.minAcquiredOrMaxPayed, "swapX2Y acquire too little");
        } else {
            // swapY2X
            (amountOut, amountIn) = IiZiSwapPool(poolAddr).swapY2X(
                recipient, params.amount, 799999,
                abi.encode(SwapCallbackData({
                    tokenX: params.tokenOut, 
                    fee: params.fee, 
                    tokenY: params.tokenIn, 
                    payer: msg.sender
                }))
            );
            require (amountOut >= params.minAcquiredOrMaxPayed, "swapY2X acquire too little");
        }
        emit MarketSwap(params.tokenIn, params.tokenOut, params.fee, Converter.toUint128(amountIn), Converter.toUint128(amountOut));
    }

}
