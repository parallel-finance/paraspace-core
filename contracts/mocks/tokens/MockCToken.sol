// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {MintableERC20} from "./MintableERC20.sol";
import {IERC20Detailed} from "../../dependencies/openzeppelin/contracts/IERC20Detailed.sol";
import {WadRayMath} from "../../protocol/libraries/math/WadRayMath.sol";

contract MockCToken is MintableERC20 {

    uint256 public exchangeRateStored;
    address private immutable _underlying;
    bool public isCToken = true;

    constructor(
        string memory name,
        string memory symbol,
        address asset
    )  MintableERC20(name, symbol, 8){
        uint256 underlyingUnit = 18;
        if (asset != address(0)) {
            underlyingUnit = IERC20Detailed(asset).decimals();
        }
        exchangeRateStored = 200000000 * (10 ** underlyingUnit);
        _underlying = asset;
    }

    function setExchangeRateStored(uint256 _exchangeRate) external {
        exchangeRateStored = _exchangeRate;
    }

    function underlying() external view returns (address) {
        assert(_underlying != address(0));
        return _underlying;
    }
}
