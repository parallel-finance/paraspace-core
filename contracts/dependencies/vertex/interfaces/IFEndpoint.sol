// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "../Endpoint.sol";

interface IFEndpoint {
    function setPriceX18(uint32 productId, int128 priceX18) external;
}
