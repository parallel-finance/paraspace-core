// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./core/interfaces/IiZiSwapCallback.sol";
import "./core/interfaces/IiZiSwapFactory.sol";
import "./core/interfaces/IiZiSwapPool.sol";

import "./libraries/MulDivMath.sol";
import "./libraries/TwoPower.sol";
import "./libraries/LogPowMath.sol";
import "./libraries/LimOrder.sol";
import "./libraries/LimOrderCircularQueue.sol";

import "./base/base.sol";

contract LimitOrderManager is Base, IiZiSwapAddLimOrderCallback {

    using LimOrderCircularQueue for LimOrderCircularQueue.Queue;

    /// @notice Emitted when user successfully create an limit order
    /// @param pool address of swap pool
    /// @param point point (price) of this limit order
    /// @param user address of user
    /// @param amount amount of token ready to sell
    /// @param sellingRemain amount of selling token remained after successfully create this limit order
    /// @param earn amount of acquired token after successfully create this limit order
    /// @param sellXEaryY true if this order sell tokenX, false if sell tokenY
    event NewLimitOrder(
        address pool,
        int24 point,
        address user,
        uint128 amount,
        uint128 sellingRemain,
        uint128 earn,
        bool sellXEaryY
    );
    /// @notice Emitted when user dec or update his limit order
    /// @param pool address of swap pool
    /// @param point point (price) of this limit order
    /// @param user address of user
    /// @param sold amount of token sold from last claim to now
    /// @param earn amount of token earned from last claim to now
    /// @param sellXEaryY true if sell tokenX, false if sell tokenY
    event Claim(
        address pool,
        int24 point,
        address user,
        uint128 sold,
        uint128 earn,
        bool sellXEaryY
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
    // seller's canceled or finished order id
    mapping(address => LimOrderCircularQueue.Queue) private addr2DeactiveOrder;

    // maximum number of active order per user
    // TODO: 
    //   currently we used a fixed number of storage space. A better way is to allow user to expand it.
    //   Otherwise, the first 300 orders need more gas for storage.
    uint256 public immutable DEACTIVE_ORDER_LIM = 300;

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
    ) external override {
        LimCallbackData memory dt = abi.decode(data, (LimCallbackData));
        verify(dt.tokenX, dt.tokenY, dt.fee);
        if (x > 0) {
            pay(dt.tokenX, dt.payer, msg.sender, x);
        }
        if (y > 0) {
            pay(dt.tokenY, dt.payer, msg.sender, y);
        }
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
        // tokenX of swap pool
        address tokenX;
        // tokenY of swap pool
        address tokenY;
        // fee amount of swap pool
        uint24 fee;
        // on which point to add limit order
        int24 pt;
        // amount of token to sell
        uint128 amount;
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
    }

    /// @notice Create a limit order for recipient.
    /// @param idx slot in the addr2ActiveOrder[msg.sender]
    /// @param addLimitOrderParam describe params of added limit order, see AddLimOrderParam for more
    /// @return orderAmount actual amount of token added in limit order
    /// @return acquire amount of tokenY acquired if there is a limit order to sell the other token before adding
    function newLimOrder(
        uint256 idx,
        AddLimOrderParam calldata addLimitOrderParam
    ) external payable checkDeadline(addLimitOrderParam.deadline) returns (uint128 orderAmount, uint128 acquire) {
        require(addLimitOrderParam.tokenX < addLimitOrderParam.tokenY, 'x<y');

        address pool = IiZiSwapFactory(factory).pool(addLimitOrderParam.tokenX, addLimitOrderParam.tokenY, addLimitOrderParam.fee);
        (orderAmount, acquire) = _addLimOrder(pool, addLimitOrderParam);
        (uint256 accEarn, , ) = getEarn(pool, address(this), addLimitOrderParam.pt, addLimitOrderParam.sellXEarnY);
        uint128 poolId = cachePoolKey(pool, PoolMeta({tokenX: addLimitOrderParam.tokenX, tokenY: addLimitOrderParam.tokenY, fee: addLimitOrderParam.fee}));
        LimOrder[] storage limOrders = addr2ActiveOrder[msg.sender];
        if (idx < limOrders.length) {
            // replace
            require(limOrders[idx].active == false, 'active conflict!');
            limOrders[idx] = LimOrder({
                pt: addLimitOrderParam.pt,
                amount: addLimitOrderParam.amount,
                sellingRemain: orderAmount,
                accSellingDec: 0,
                sellingDec: 0,
                earn: acquire,
                lastAccEarn: accEarn,
                poolId: poolId,
                sellXEarnY: addLimitOrderParam.sellXEarnY,
                timestamp: uint128(block.timestamp),
                active: true
            });
        } else {
            limOrders.push(LimOrder({
                pt: addLimitOrderParam.pt,
                amount: addLimitOrderParam.amount,
                sellingRemain: orderAmount,
                accSellingDec: 0,
                sellingDec: 0,
                earn: acquire,
                lastAccEarn: accEarn,
                poolId: poolId,
                sellXEarnY: addLimitOrderParam.sellXEarnY,
                timestamp: uint128(block.timestamp),
                active: true
            }));
        }
        emit NewLimitOrder(pool, addLimitOrderParam.pt, msg.sender, addLimitOrderParam.amount, orderAmount, acquire, addLimitOrderParam.sellXEarnY);
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
        emit Claim(pool, order.pt, msg.sender, sold, earn, order.sellXEarnY);
    }

    /// @notice Update a limit order to claim earned tokens as much as possible.
    /// @param orderIdx idx of order to update
    /// @return earn amount of earned token this limit order can claim
    function updateOrder(
        uint256 orderIdx
    ) external checkActive(orderIdx) returns (uint256 earn) {
        LimOrder storage order = addr2ActiveOrder[msg.sender][orderIdx];
        address pool = poolAddrs[order.poolId];
        earn = _updateOrder(order, pool);
    }

    /// @notice Decrease amount of selling-token of a limit order.
    /// @param orderIdx point of seller's limit order
    /// @param amount max amount of selling-token to decrease
    /// @param deadline deadline timestamp of transaction
    /// @return actualDelta actual amount of selling-token decreased
    function decLimOrder(
        uint256 orderIdx,
        uint128 amount,
        uint256 deadline
    ) external checkActive(orderIdx) checkDeadline(deadline) returns (uint128 actualDelta) {
        require(amount > 0, "A0");
        LimOrder storage order = addr2ActiveOrder[msg.sender][orderIdx];
        address pool = poolAddrs[order.poolId];
        // update order first
        _updateOrder(order, pool);
        // now dec
        actualDelta = amount;
        if (actualDelta > order.sellingRemain) {
            actualDelta = uint128(order.sellingRemain);
        }
        uint128 actualDeltaRefund;
        if (order.sellXEarnY) {
            (actualDeltaRefund, ) = IiZiSwapPool(pool).decLimOrderWithX(order.pt, actualDelta);
        } else {
            (actualDeltaRefund, ) = IiZiSwapPool(pool).decLimOrderWithY(order.pt, actualDelta);
        }
        // actualDeltaRefund may be less than actualDelta
        // but we still minus actualDelta in sellingRemain, and only add actualDeltaRefund to sellingDec
        // because if actualDeltaRefund < actualDelta
        // then other users cannot buy from this limit order any more
        // and also, the seller cannot fetch back more than actualDeltaRefund from swap pool >_<
        // but fortunately, actualDeltaRefund < actualDelta only happens after swap on this limit order
        // and also, actualDelta - actualDeltaRefund is a very small deviation
        order.sellingRemain -= actualDelta;
        order.sellingDec += actualDeltaRefund;
        order.accSellingDec += actualDeltaRefund;
    }

    /// @notice Collect earned or decreased token from a limit order.
    /// @param recipient address to benefit
    /// @param orderIdx idx of limit order
    /// @param collectDec max amount of decreased selling token to collect
    /// @param collectEarn max amount of earned token to collect
    /// @return actualCollectDec actual amount of decresed selling token collected
    /// @return actualCollectEarn actual amount of earned token collected
    function collectLimOrder(
        address recipient,
        uint256 orderIdx,
        uint128 collectDec,
        uint128 collectEarn
    ) external checkActive(orderIdx) returns (uint128 actualCollectDec, uint128 actualCollectEarn) {
        LimOrder storage order = addr2ActiveOrder[msg.sender][orderIdx];
        address pool = poolAddrs[order.poolId];
        // update order first
        _updateOrder(order, pool);
        // now collect
        actualCollectDec = collectDec;
        if (actualCollectDec > order.sellingDec) {
            actualCollectDec = order.sellingDec;
        }
        actualCollectEarn = collectEarn;
        if (actualCollectEarn > order.earn) {
            actualCollectEarn = order.earn;
        }
        if (recipient == address(0)) {
            recipient = address(this);
        }
        IiZiSwapPool(pool).collectLimOrder(recipient, order.pt, actualCollectDec, actualCollectEarn, order.sellXEarnY);
        // collect from core may be less, but we still do not modify actualCollectEarn(Dec)
        order.sellingDec -= actualCollectDec;
        order.earn -= actualCollectEarn;

        bool noRemain = (order.sellingRemain == 0);
        if (order.sellingRemain > 0) {
            noRemain = (order.amount / order.sellingRemain > 100000);
        }

        if (order.sellingDec == 0 && noRemain && order.earn == 0) {
            order.active = false;
            // addr2DeactiveOrderID[msg.sender].add(orderId);
            addr2DeactiveOrder[msg.sender].add(order, DEACTIVE_ORDER_LIM);
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

    /// @notice Returns deactived orders for the seller.
    /// @param user address of the seller
    /// @return deactiveLimitOrder list of deactived orders
    function getDeactiveOrders(address user) external view returns (LimOrder[] memory deactiveLimitOrder) {
        LimOrderCircularQueue.Queue storage queue = addr2DeactiveOrder[user];
        if (queue.limOrders.length == 0) {
            return deactiveLimitOrder;
        }
        deactiveLimitOrder = new LimOrder[](queue.limOrders.length);
        uint256 start = queue.start;
        for (uint256 i = 0; i < queue.limOrders.length; i ++) {
            deactiveLimitOrder[i] = queue.limOrders[(start + i) % queue.limOrders.length];
        }
        return deactiveLimitOrder;
    }

    /// @notice Returns a single deactived order for the seller.
    /// @param user address of the seller
    /// @param idx index of the deactived order list
    /// @return limOrder the target deactived order
    function getDeactiveOrder(address user, uint256 idx) external view returns (LimOrder memory limOrder) {
        LimOrderCircularQueue.Queue storage queue = addr2DeactiveOrder[user];
        require(idx < queue.limOrders.length, 'Out Of Length');
        return queue.limOrders[(queue.start + idx) % queue.limOrders.length];
    }

}
