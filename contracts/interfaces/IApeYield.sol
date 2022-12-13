// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

interface IApeYield {
    event Deposit(
        address indexed user,
        uint256 amountDeposited,
        uint256 amountShare
    );

    event Redeem(
        address indexed user,
        uint256 amountShare,
        uint256 amountWithdraw
    );

    function deposit(
        address onBehalf,
        address payer,
        uint256 amount
    ) external;

    function withdraw(
        address onBehalf,
        address receiver,
        uint256 amountShare
    ) external;

    function getApeBalanceForUser(address user)
        external
        view
        returns (uint256 apeAmount);
}
