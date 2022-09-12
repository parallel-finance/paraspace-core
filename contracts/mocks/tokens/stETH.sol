// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {MintableERC20} from "./MintableERC20.sol";

interface ILido {
    function getPooledEthByShares(uint256 _sharesAmount)
        external
        view
        returns (uint256);
}


contract stETH is MintableERC20, ILido {


    uint256 internal _shares;


    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals
    )  MintableERC20(name, symbol, decimals){

    }

    
    function setPooledEthBaseShares(uint256 _sharesAmount)
        external {
            _shares = _sharesAmount;
        }

    function getPooledEthByShares(uint256 _sharesAmount)
        external
        view
        returns (uint256) {
            return _shares * _sharesAmount;
        }
}