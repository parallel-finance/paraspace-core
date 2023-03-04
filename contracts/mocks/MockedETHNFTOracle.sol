// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import "../interfaces/IInstantNFTOracle.sol";

contract MockedETHNFTOracle is IInstantNFTOracle {
    uint256 internal endTime;
    constructor() {
        endTime = block.timestamp + 86400;
    }

    function getPresentValueAndDiscountRate(uint256, uint256)
    external
    pure
    returns (uint256, uint256) {
        return (1e18, 9000);
    }

    function getPresentValueByDiscountRate(
        uint256,
        uint256
    ) external pure returns (uint256) {
        return 1e18;
    }

    function getEndTime(uint256) external view returns (uint256) {
        return endTime;
    }
}
