// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import "../interfaces/IInstantNFTOracle.sol";

contract MockedETHNFTOracle is IInstantNFTOracle {
    uint256 internal startTime;
    uint256 internal endTime;
    constructor() {
        startTime = block.timestamp;
        endTime = block.timestamp + 86400;
    }

    function getPresentValueAndDiscountRate(uint256, uint256, uint256)
    external
    view
    returns (uint256, uint256) {
        return (_getPresentValue(), 9000);
    }

    function getPresentValueByDiscountRate(
        uint256,
        uint256,
        uint256
    ) external view returns (uint256) {
        return _getPresentValue();
    }

    function getEndTime(uint256) external view returns (uint256) {
        return endTime;
    }

    function _getPresentValue() internal view returns(uint256) {
        return (block.timestamp - startTime) * 1e12 + 1e18;
    }
}
