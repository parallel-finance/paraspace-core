// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

/**
 * @title SApe receiver interface
 */
interface IAutoYieldApe {
    /**
     * @dev Emitted during deposit()
     * @param user The address of the user deposit for
     * @param amountDeposited The amount being deposit
     **/
    event Deposit(
        address indexed caller,
        address indexed user,
        uint256 amountDeposited
    );

    /**
     * @dev Emitted during withdraw()
     * @param user The address of the user
     * @param amountWithdraw The amount being withdraw
     **/
    event Redeem(address indexed user, uint256 amountWithdraw);

    /**
     * @dev Emitted during rescueERC20()
     * @param token The address of the token
     * @param to The address of the recipient
     * @param amount The amount being rescued
     **/
    event RescueERC20(
        address indexed token,
        address indexed to,
        uint256 amount
    );

    /**
     * @notice deposit an `amount` of ape into pool.
     * @param onBehalf The address of user will receive the sApe balance
     * @param amount The amount of ape to be deposit
     **/
    function deposit(address onBehalf, uint256 amount) external;

    /**
     * @notice withdraw an `amount` of ape from compound pool.
     * @param amount The amount of ape to be withdraw
     **/
    function withdraw(uint256 amount) external;

    /**
     * @notice claim the yield token.
     **/
    function claim() external;

    /**
     * @notice withdraw all balance of ape from pool.
     **/
    function exit() external;
}
