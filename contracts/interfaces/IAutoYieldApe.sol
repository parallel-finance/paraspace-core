// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

/**
 * @title AutoYieldApe interface
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
     * @dev Emitted during claim()
     * @param user The address of the user
     * @param amount The amount being claimed
     **/
    event YieldClaimed(
        address indexed caller,
        address indexed user,
        uint256 amount
    );

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
     * @dev Emitted during setHarvestOperator()
     * @param oldOperator The address of the old harvest operator
     * @param newOperator The address of the new harvest operator
     **/
    event HarvestOperatorUpdated(address oldOperator, address newOperator);

    /**
     * @dev Emitted during setHarvestFeeRate()
     * @param oldFee The value of the old harvest fee
     * @param newFee The value of the new harvest fee
     **/
    event HarvestFeeRateUpdated(uint256 oldFee, uint256 newFee);

    /**
     * @notice deposit an `amount` of ape into pool.
     * @param onBehalf The address of user will receive the yApe balance
     * @param amount The amount of ape to be deposit
     **/
    function deposit(address onBehalf, uint256 amount) external;

    /**
     * @notice withdraw an `amount` of ape from yield pool.
     * @param amount The amount of ape to be withdraw
     **/
    function withdraw(uint256 amount) external;

    /**
     * @notice claim the yield token for the specified account.
     * @param account The account address will be claimed
     **/
    function claimFor(address account) external;

    /**
     * @notice withdraw all balance of ape from pool.
     **/
    function exit() external;

    /**
     * @notice This function will claim the pending Ape Coin reward and sell it to usdc by uniswap,
     then supply usdc to pUsdc. This is is the only way to update pool yield index.
     This function can only be called by harvestOperator
     * @param swapPath The uniswap v3 swap path for selling Ape coin to usdc
     * @param minimumDealPrice The minimal accept deal price to sell Ape coin to usdc
     **/
    function harvest(bytes memory swapPath, uint256 minimumDealPrice) external;

    /**
     * @notice fetch the settled yield amount for the specified account.
     **/
    function yieldAmount(address account) external view returns (uint256);
}
