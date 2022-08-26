// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {Errors} from "../helpers/Errors.sol";
import {DataTypes} from "../types/DataTypes.sol";

/**
 * @title AuctionLiquidationConfiguration library
 *
 * @notice Implements the bitmap logic to handle the auction liquidation configuration
 */
library AuctionLiquidationConfiguration {
    uint24 internal constant AUCTION_START_THRESHOLD_MASK =    0x00FFFF; // prettier-ignore
    uint24 internal constant AUCTION_DURATION_HOUR_MASK =      0xFF00FF; // prettier-ignore
    uint24 internal constant FLOOR_THRESHOLD_PERCENTAGE_MASK = 0xFFFF00; // prettier-ignore

    uint8 internal constant MAX_VALID_AUCTION_START_THRESHOLD = 255;
    uint8 internal constant MAX_VALID_AUCTION_HOUR_DURATION = 255;
    uint8 internal constant MAX_VALID_THRESHOLD_PERCENTAGE = 255;

    function getAuctionStartThreshold(
        DataTypes.AuctionLiquidationConfigurationMap memory self
    ) internal pure returns (uint8 auctionStartThreshold) {
        require(
            auctionStartThreshold <= MAX_VALID_AUCTION_START_THRESHOLD,
            Errors.INVALID_LIQ_THRESHOLD
        );

        self.data =
            (self.data & AUCTION_START_THRESHOLD_MASK) |
            auctionStartThreshold;
    }

    function getAuctionHourDuration(
        DataTypes.AuctionLiquidationConfigurationMap memory self
    ) internal pure returns (uint8 auctionHourDuration) {
        require(
            auctionHourDuration <= MAX_VALID_AUCTION_HOUR_DURATION,
            Errors.INVALID_AMOUNT
        );

        self.data =
            (self.data & AUCTION_DURATION_HOUR_MASK) |
            auctionHourDuration;
    }

    function getFloorThresholdPercentage(
        DataTypes.AuctionLiquidationConfigurationMap memory self
    ) internal pure returns (uint8 floorThresholdPercentage) {
        require(
            floorThresholdPercentage <= MAX_VALID_THRESHOLD_PERCENTAGE,
            Errors.INVALID_LIQ_THRESHOLD
        );

        self.data =
            (self.data & FLOOR_THRESHOLD_PERCENTAGE_MASK) |
            floorThresholdPercentage;
    }
}
