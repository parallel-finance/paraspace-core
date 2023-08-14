// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.4;

/// @title FixedPoint128
/// @notice A library for handling binary fixed point numbers, see https://en.wikipedia.org/wiki/Q_(number_format)
library TwoPower {

    uint256 internal constant pow96 = 0x1000000000000000000000000;
    uint256 internal constant pow128 = 0x100000000000000000000000000000000;
    uint8 internal constant RESOLUTION = 96;

}