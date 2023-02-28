// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {ICLSynchronicityPriceAdapter} from "../dependencies/chainlink/ICLSynchronicityPriceAdapter.sol";
import {IExchangeRate} from "../interfaces/IExchangeRate.sol";
import {SafeCast} from "../dependencies/openzeppelin/contracts/SafeCast.sol";

/**
 * @title CLExchangeRateSynchronicityPriceAdapter
 * @notice Price adapter to calculate price using exchange rate
 */
contract CLExchangeRateSynchronicityPriceAdapter is
    ICLSynchronicityPriceAdapter
{
    using SafeCast for uint256;

    /**
     * @notice asset which provides exchange rate
     */
    IExchangeRate public immutable ASSET;

    /**
     * @param asset the address of ASSET
     */
    constructor(address asset) {
        ASSET = IExchangeRate(asset);
    }

    /// @inheritdoc ICLSynchronicityPriceAdapter
    function latestAnswer() public view virtual override returns (int256) {
        return ASSET.getExchangeRate().toInt256();
    }
}
