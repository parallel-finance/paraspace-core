// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;
import "./IVersion.sol";

interface IFeeCalculator is IVersion {
    struct FeeRates {
        int64 makerRateX18;
        int64 takerRateX18;
        uint8 isNonDefault; // 1: non-default, 0: default
    }

    function getClearinghouse() external view returns (address);

    function migrate(address _clearinghouse) external;

    function recordVolume(bytes32 subaccount, uint128 quoteVolume) external;

    function getFeeFractionX18(
        bytes32 subaccount,
        uint32 productId,
        bool taker
    ) external view returns (int128);

    function getInterestFeeFractionX18(uint32 productId)
        external
        view
        returns (int128);

    function getLiquidationFeeFractionX18(bytes32 subaccount, uint32 productId)
        external
        view
        returns (int128);

    function updateFeeRates(
        address user,
        uint32 productId,
        int64 makerRateX18,
        int64 takerRateX18
    ) external;
}
