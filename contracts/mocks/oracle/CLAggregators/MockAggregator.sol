// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IEACAggregatorProxy} from "../../../interfaces/IEACAggregatorProxy.sol";


contract MockAggregator is IEACAggregatorProxy{
    int256 private _latestAnswer;

    constructor(int256 initialAnswer) {
        _latestAnswer = initialAnswer;
        emit AnswerUpdated(initialAnswer, 0, block.timestamp);
    }

    function updateLatestAnswer(int256 answer) external {
        _latestAnswer = answer;
        emit AnswerUpdated(answer, 0, block.timestamp);
    }

    function latestAnswer() external view returns (int256) {
        return _latestAnswer;
    }

    function getTokenType() external pure returns (uint256) {
        return 1;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function getTimestamp(uint256) external view override returns (uint256) {
        return block.timestamp;
    }

    function latestRound() external pure override returns (uint256) {
        return 0;
    }

    function getAnswer(uint256) external view override returns (int256) {
        return _latestAnswer;
    }

    function latestTimestamp() external view returns (uint256) {
        return block.timestamp;
    }
}
