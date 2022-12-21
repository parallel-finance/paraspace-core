// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IEACAggregatorProxy} from "../interfaces/IEACAggregatorProxy.sol";
import {IERC20Detailed} from "../dependencies/openzeppelin/contracts/IERC20Detailed.sol";

contract BaseCurrencyOracleWrapper is IEACAggregatorProxy {
    address public immutable BASE_CURRENCY;
    uint256 public immutable BASE_CURRENCY_UNIT;

    constructor(address baseCurrency, uint256 baseCurrencyUnit) {
        BASE_CURRENCY = baseCurrency;
        BASE_CURRENCY_UNIT = baseCurrencyUnit;
    }

    function decimals() external view override returns (uint8) {
        return IERC20Detailed(BASE_CURRENCY).decimals();
    }

    function latestAnswer() external view override returns (int256) {
        return int256(BASE_CURRENCY_UNIT);
    }

    function latestTimestamp() external view override returns (uint256) {
        return block.timestamp;
    }

    function latestRound() external pure override returns (uint256) {
        return 0;
    }

    function getAnswer(uint256) external view override returns (int256) {
        return int256(BASE_CURRENCY_UNIT);
    }

    function getTimestamp(uint256) external view override returns (uint256) {
        return block.timestamp;
    }
}
