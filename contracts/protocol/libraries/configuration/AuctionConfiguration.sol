// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {Errors} from "../helpers/Errors.sol";
import {DataTypes} from "../types/DataTypes.sol";

/**
 * @title AuctionConfiguration library
 *
 * @notice Implements the bitmap logic to handle the auction configuration
 */
library AuctionConfiguration {
    uint256 internal constant AUCTION_ENABLED_MASK =                    0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFE; // prettier-ignore
    uint256 internal constant AUCTION_RECOVERY_HEALTH_FACTOR_MASK =     0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFE0000000000000001; // prettier-ignore

    uint256
        internal constant AUCTION_RECOVERY_HEALTH_FACTOR_START_BIT_POSITION = 1;

    uint256 internal constant MAX_VALID_AUCTION_RECOVERY_HEALTH_FACTOR =
        18446744073709551615;

    /**
     * @notice Sets the auction flag for the reserve.
     * @param self The reserve auction configuration
     * @param auctionEnabled True if asset can be auctioned
     **/
    function setAuctionEnabled(
        DataTypes.ReserveAuctionConfigurationMap memory self,
        bool auctionEnabled
    ) internal pure {
        self.data =
            (self.data & AUCTION_ENABLED_MASK) |
            (uint256(auctionEnabled ? 1 : 0));
    }

    /**
     * @notice Gets the auction flag of the reserve
     * @param self The reserve auction configuration
     * @return The auction flag
     **/
    function getAuctionEnabled(
        DataTypes.ReserveAuctionConfigurationMap memory self
    ) internal pure returns (bool) {
        return (self.data & ~AUCTION_ENABLED_MASK) != 0;
    }

    /**
     * @notice Sets the auction recovery health factor for the reserve.
     * @param self The reserve auction configuration
     * @param auctionRecoveryHealthFactor The auction recovery health factor
     **/
    function setAuctionRecoveryHealthFactor(
        DataTypes.ReserveAuctionConfigurationMap memory self,
        uint256 auctionRecoveryHealthFactor
    ) internal pure {
        require(
            auctionRecoveryHealthFactor <=
                MAX_VALID_AUCTION_RECOVERY_HEALTH_FACTOR,
            Errors.INVALID_AUCTION_RECOVERY_HEALTH_FACTOR
        );

        self.data =
            (self.data & AUCTION_RECOVERY_HEALTH_FACTOR_MASK) |
            (auctionRecoveryHealthFactor <<
                AUCTION_RECOVERY_HEALTH_FACTOR_START_BIT_POSITION);
    }

    /**
     * @notice Gets the auction recovery health factor of the reserve.
     * @param self The reserve auction configuration
     * @return The auction recovery health factor
     **/
    function getAuctionRecoveryHealthFactor(
        DataTypes.ReserveAuctionConfigurationMap memory self
    ) internal pure returns (uint256) {
        return
            (self.data & ~AUCTION_RECOVERY_HEALTH_FACTOR_MASK) >>
            AUCTION_RECOVERY_HEALTH_FACTOR_START_BIT_POSITION;
    }
}
