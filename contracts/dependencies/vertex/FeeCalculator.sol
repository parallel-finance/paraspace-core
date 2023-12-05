// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./Version.sol";
import "./interfaces/IFeeCalculator.sol";
import "./common/Errors.sol";

contract FeeCalculator is Initializable, IFeeCalculator, Version {
    address private clearinghouse;
    mapping(address => mapping(uint32 => FeeRates)) feeRates;

    function initialize() external initializer {}

    function migrate(address _clearinghouse) external {
        require(clearinghouse == address(0), "already migrated");
        clearinghouse = _clearinghouse;
    }

    function getClearinghouse() external view returns (address) {
        return clearinghouse;
    }

    function recordVolume(bytes32 subaccount, uint128 quoteVolume) external {}

    function getFeeFractionX18(
        bytes32 subaccount,
        uint32 productId,
        bool taker
    ) external view returns (int128) {
        require(productId != 0 && productId <= 42, "invalid productId");
        FeeRates memory userFeeRates = feeRates[
            address(uint160(bytes20(subaccount)))
        ][productId];
        if (userFeeRates.isNonDefault == 0) {
            // use the default fee rates.
            if (
                productId == 1 ||
                productId == 3 ||
                productId == 5 ||
                productId == 6 ||
                productId == 8 ||
                productId == 10 ||
                productId == 12 ||
                productId == 14 ||
                productId == 16 ||
                productId == 18 ||
                productId == 20 ||
                productId == 22 ||
                productId == 24 ||
                productId == 26 ||
                productId == 28 ||
                productId == 30 ||
                productId == 34 ||
                productId == 36 ||
                productId == 38 ||
                productId == 40 ||
                productId == 41
            ) {
                // btc-spot, eth-spot, arb-spot, arb-perp, bnb-perp, xrp-perp, sol-perp,
                // matic-perp, sui-perp, op-perp, apt-perp, ltc-perp, bch-perp, comp-perp,
                // mkr-perp, mpepe-perp, doge-perp, link-perp, dydx-perp, crv-perp, vrtx-spot
                userFeeRates = FeeRates(0, 300_000_000_000_000, 1);
            } else if (productId == 2 || productId == 4 || productId == 31) {
                // btc-perp, eth-perp, usdt-spot
                userFeeRates = FeeRates(0, 200_000_000_000_000, 1);
            } else {
                // placeholders
                userFeeRates = FeeRates(0, 0, 1);
            }
        }
        return taker ? userFeeRates.takerRateX18 : userFeeRates.makerRateX18;
    }

    function getInterestFeeFractionX18(
        uint32 /* productId */
    ) external pure returns (int128) {
        return 200_000_000_000_000_000; // 20%
    }

    function getLiquidationFeeFractionX18(
        bytes32, /* subaccount */
        uint32 /* productId */
    ) external pure returns (int128) {
        return 500_000_000_000_000_000; // 50%
    }

    function updateFeeRates(
        address user,
        uint32 productId,
        int64 makerRateX18,
        int64 takerRateX18
    ) external {
        require(msg.sender == clearinghouse, ERR_UNAUTHORIZED);
        feeRates[user][productId] = FeeRates(makerRateX18, takerRateX18, 1);
    }
}
