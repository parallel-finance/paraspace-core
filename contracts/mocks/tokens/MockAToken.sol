// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {MintableERC20} from "./MintableERC20.sol";
import {WadRayMath} from "../../protocol/libraries/math/WadRayMath.sol";

contract MockAToken is MintableERC20 {

    uint256 public incomeIndex;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals
    )  MintableERC20(name, symbol, decimals){
        incomeIndex = WadRayMath.RAY;
    }

    function setIncomeIndex(uint256 _incomeIndex) external{
        incomeIndex = _incomeIndex;
    }

    function getReserveNormalizedIncome(address)
    external
    view
    returns (uint256) {
        return incomeIndex;
    }

    function POOL() external view returns (address){
        return address(this);
    }

    function UNDERLYING_ASSET_ADDRESS() external view returns (address) {
        return address(this);
    }
}
