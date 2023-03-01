// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

interface ICToken {
    /**
     * @return whether if the token is a cToken
     */
    function isCToken() external view returns (bool);

    /**
     * @return the stored exchange rate
     */
    function exchangeRateStored() external view returns (uint256);

    /**
     * @return the underlying asset
     */
    function underlying() external view returns (address);
}
