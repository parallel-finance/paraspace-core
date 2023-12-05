// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint256 private constant INITIAL_SUPPLY = 100 ether;
    uint8 private _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        _mint(msg.sender, INITIAL_SUPPLY);
        _decimals = decimals_;
    }

    /// @dev Unpermissioned minting for testing
    function mint(address account, uint256 amount) external {
        require(amount < 100 ether, "MockERC20: amount too large");
        _mint(account, amount);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
