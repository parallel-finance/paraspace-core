// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IEACAggregatorProxy} from "../../../interfaces/IEACAggregatorProxy.sol";


contract MockAggregator is IEACAggregatorProxy{
    int256 private _latestAnswer;

    constructor(int256 initialAnswer) {
        _latestAnswer = initialAnswer;
    }

    function updateLatestAnswer(int256 answer) external {
        _latestAnswer = answer;
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function description() external pure returns (string memory) {
        return "";
    }

    function version() external pure returns (uint256) {
        return 0;
    }

    function getRoundData(uint80)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) {
            answer = _latestAnswer;
        }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) {
            answer = _latestAnswer;
        }
}
