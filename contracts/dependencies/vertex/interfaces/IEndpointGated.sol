// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./IEndpoint.sol";

interface IEndpointGated {
    // this is all that remains lol, everything else is private or a modifier etc.
    function getOraclePriceX18(uint32 productId) external view returns (int128);

    function getOraclePricesX18(uint32 healthGroup)
        external
        view
        returns (IEndpoint.Prices memory);

    function getEndpoint() external view returns (address endpoint);
}
