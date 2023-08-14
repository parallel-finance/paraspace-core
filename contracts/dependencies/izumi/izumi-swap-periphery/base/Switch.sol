// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract Switch is Ownable {
    
    bool public pause = false;
    modifier notPause() {
        require(!pause, "paused");
        _;
    }
    function setPause(bool value) external onlyOwner {
        pause = value;
    }
}