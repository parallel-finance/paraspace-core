// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IETHWithdrawal {
    enum StakingProvider {
        Validator,
        Lido,
        RocketPool,
        Coinbase
    }

    struct TokenInfo {
        StakingProvider provider;
        uint64 exitEpoch;
        uint64 withdrawableEpoch;
        uint256 balance;
        uint256 withdrawableTime;
    }

    function mint(
        StakingProvider provider,
        uint64 exitEpoch,
        uint64 withdrawableEpoch,
        uint256 balance,
        address recipient,
        uint256 withdrawableTime
    ) external returns (uint256);

    function burn(
        uint256 tokenId,
        address recipient,
        uint256 amount
    ) external;

    function getTokenPrice(uint256 tokenId, uint256 borrowRate)
        external
        view
        returns (uint256);

    function getPresentValueAndDiscountRate(uint256 tokenId, uint256 borrowRate)
        external
        view
        returns (uint256 price, uint256 discountRate);

    function getPresentValueByDiscountRate(
        uint256 tokenId,
        uint256 discountRate
    ) external view returns (uint256 price);

    function setProviderStrategyAddress(
        StakingProvider provider,
        address strategy
    ) external;
}
