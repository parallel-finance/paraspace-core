// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {ICLSynchronicityPriceAdapter} from "../dependencies/chainlink/ICLSynchronicityPriceAdapter.sol";

contract CLFixedPriceSynchronicityPriceAdapter is ICLSynchronicityPriceAdapter {
    uint256 public immutable FIXED_PRICE;

    constructor(uint256 fixedPrice) {
        FIXED_PRICE = fixedPrice;
    }

    function latestAnswer() external view override returns (int256) {
        return int256(FIXED_PRICE);
    }
}
