
// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {MintableERC20} from "./MintableERC20.sol";
import {WadRayMath} from "../../protocol/libraries/math/WadRayMath.sol";
import {IExchangeRate} from "../../interfaces/IExchangeRate.sol";

contract MockRETH is MintableERC20, IExchangeRate {
    uint256 public etherPerShares;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals
    )  MintableERC20(name, symbol, decimals){
        etherPerShares = 1125000000000000000;
    }

    function setEtherPerShares(uint256 _etherPerShares) external{
        etherPerShares = _etherPerShares;
    }

    function getExchangeRate()
    external
    view
    returns (uint256) {
        return etherPerShares;
    }
}
