// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

/**
 * @title IReserveAuctionStrategy
 *
 * @notice Interface for the calculation of current auction price
 */
interface IReserveAuctionStrategy {
    function getMaxPriceRatio() external view returns (uint256);

    function getMinExpPriceRatio() external view returns (uint256);

    function getMinPriceRatio() external view returns (uint256);

    function getStepLinearRatio() external view returns (uint256);

    function getStepExp() external view returns (uint256);

    function getTickLength() external view returns (uint256);

    /**
     * @notice Calculates the interest rates depending on the reserve's state and configurations
     * @param auctionStartTimestamp The auction start block timestamp
     * @param currentTimestamp The current block timestamp
     * @return auctionPrice The current auction price
     **/
    function calculateAuctionPrice(
        uint256 auctionStartTimestamp,
        uint256 currentTimestamp
    ) external view returns (uint256);
}
