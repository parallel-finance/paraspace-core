// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ICLSynchronicityPriceAdapter} from "../dependencies/chainlink/ICLSynchronicityPriceAdapter.sol";
import {CLExchangeRateSynchronicityPriceAdapter} from "./CLExchangeRateSynchronicityPriceAdapter.sol";
import {ICToken} from "../interfaces/ICToken.sol";
import {IERC20Detailed} from "../dependencies/openzeppelin/contracts/IERC20Detailed.sol";
import {IExchangeRate} from "../interfaces/IExchangeRate.sol";
import {SafeCast} from "../dependencies/openzeppelin/contracts/SafeCast.sol";

/**
 * @title CLCETHSynchronicityPriceAdapter
 * @notice Price adapter to calculate price using exchange rate
 */
contract CLCETHSynchronicityPriceAdapter is
    CLExchangeRateSynchronicityPriceAdapter
{
    using SafeCast for uint256;

    uint256 constant SCALE = 1e18;
    uint256 constant CETH_UNIT = 1e8;
    uint256 constant ETH_UNIT = 1e18;
    uint256 constant ETH_PRICE = 1e18;

    /**
     * @param asset the address of ASSET
     */
    constructor(address asset) CLExchangeRateSynchronicityPriceAdapter(asset) {}

    function getExchangeRate()
        public
        view
        virtual
        override(CLExchangeRateSynchronicityPriceAdapter)
        returns (uint256)
    {
        uint256 exchangeRate = ICToken(ASSET).exchangeRateStored();

        // cETH price / CETH_UNIT = ETH price / ETH_UNIT * (exchangeRate / SCALE)
        // cETH price = ETH price * exchangeRate * CETH_UNIT / (ETH_UNIT * SCALE)
        return (ETH_PRICE * (exchangeRate * CETH_UNIT)) / (ETH_UNIT * SCALE);
    }
}
