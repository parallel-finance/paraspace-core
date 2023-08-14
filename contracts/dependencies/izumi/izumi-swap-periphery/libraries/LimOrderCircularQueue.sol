// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.4;

import "./LimOrder.sol";

library LimOrderCircularQueue {

    struct Queue {
        // start, start+1, ..., MAX_LENGTH-1, 0, 1, ..., start-1
        uint256 start;
        LimOrder[] limOrders;
    }

    function add(Queue storage queue, LimOrder memory limOrder, uint256 capacity) internal {
        if (queue.limOrders.length < capacity) {
            queue.limOrders.push(limOrder);
        } else {
            queue.limOrders[queue.start] = limOrder;
            queue.start = (queue.start + 1) % queue.limOrders.length;
        }
    }

}
