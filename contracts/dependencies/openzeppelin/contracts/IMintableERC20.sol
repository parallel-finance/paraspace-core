// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import "./IERC20Detailed.sol";

interface IMintableERC20 is IERC20Detailed {
    /**
     * @dev Function to mint tokens
     * @param value The amount of tokens to mint.
     * @return A boolean that indicates if the operation was successful.
     */
    function mint(uint256 value) external returns (bool);

    /**
     * @dev Function to mint tokens to address
     * @param account The account to mint tokens.
     * @param value The amount of tokens to mint.
     * @return A boolean that indicates if the operation was successful.
     */
    function mint(address account, uint256 value) external returns (bool);
}
