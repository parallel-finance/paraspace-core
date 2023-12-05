// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IEndpoint.sol";
import "./interfaces/IEndpointGated.sol";
import "./libraries/MathSD21x18.sol";
import "./common/Constants.sol";
import "hardhat/console.sol";

abstract contract EndpointGated is OwnableUpgradeable, IEndpointGated {
    address private endpoint;

    function setEndpoint(address _endpoint) public onlyOwner {
        endpoint = _endpoint;
    }

    function getEndpoint() public view returns (address) {
        return endpoint;
    }

    function getOraclePriceX18(uint32 productId) public view returns (int128) {
        if (productId == QUOTE_PRODUCT_ID) {
            return MathSD21x18.fromInt(1);
        }
        return IEndpoint(endpoint).getPriceX18(productId);
    }

    function getOraclePricesX18(uint32 healthGroup)
        public
        view
        returns (IEndpoint.Prices memory)
    {
        return IEndpoint(endpoint).getPricesX18(healthGroup);
    }

    function getOracleTime() internal view returns (uint128) {
        return IEndpoint(endpoint).getTime();
    }

    modifier onlyEndpoint() {
        require(
            msg.sender == endpoint,
            "SequencerGated: caller is not the endpoint"
        );
        _;
    }
}
