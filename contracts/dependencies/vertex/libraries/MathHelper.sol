// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;
import "./MathSD21x18.sol";

/// @title MathHelper
/// @dev Provides basic math functions
library MathHelper {
    using MathSD21x18 for int128;

    /// @notice Returns market id for two given product ids
    function max(int128 a, int128 b) internal pure returns (int128) {
        return a > b ? a : b;
    }

    function min(int128 a, int128 b) internal pure returns (int128) {
        return a < b ? a : b;
    }

    function abs(int128 val) internal pure returns (int128) {
        return val < 0 ? -val : val;
    }

    // babylonian method (https://en.wikipedia.org/wiki/Methods_of_computing_square_roots#Babylonian_method)
    function sqrt(int128 y) internal pure returns (int128 z) {
        require(y >= 0, "ds-math-sqrt-non-positive");
        if (y > 3) {
            z = y;
            int128 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    function sqrt256(int256 y) internal pure returns (int256 z) {
        require(y >= 0, "ds-math-sqrt-non-positive");
        if (y > 3) {
            z = y;
            int256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    function int2str(int128 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }

        bool negative = value < 0;
        uint128 absval = uint128(negative ? -value : value);
        string memory out = uint2str(absval);
        if (negative) {
            out = string.concat("-", out);
        }
        return out;
    }

    function uint2str(uint128 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint128 temp = value;
        uint128 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint128(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v3.1.0/contracts/math/SignedSafeMath.sol#L86
    function add(int128 x, int128 y) internal pure returns (int128) {
        int128 z = x + y;
        require((y >= 0 && z >= x) || (y < 0 && z < x), "ds-math-add-overflow");
        return z;
    }

    // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v3.1.0/contracts/math/SignedSafeMath.sol#L69
    function sub(int128 x, int128 y) internal pure returns (int128) {
        int128 z = x - y;
        require(
            (y >= 0 && z <= x) || (y < 0 && z > x),
            "ds-math-sub-underflow"
        );
        return z;
    }

    function mul(int128 x, int128 y) internal pure returns (int128 z) {
        require(y == 0 || (z = x * y) / y == x, "ds-math-mul-overflow");
    }

    function floor(int128 x, int128 y) internal pure returns (int128 z) {
        require(y > 0, "ds-math-floor-neg-mod");
        int128 r = x % y;
        if (r == 0) {
            z = x;
        } else {
            z = (x >= 0 ? x - r : x - r - y);
        }
    }

    function ceil(int128 x, int128 y) internal pure returns (int128 z) {
        require(y > 0, "ds-math-ceil-neg-mod");
        int128 r = x % y;
        if (r == 0) {
            z = x;
        } else {
            z = (x >= 0 ? x + y - r : x - r);
        }
    }

    // we don't need to floor base with sizeIncrement in this function
    // because this function is only used by `view` functions, which means
    // the returned values will not be written into storage.
    function ammEquilibrium(
        int128 base,
        int128 quote,
        int128 priceX18
    ) internal pure returns (int128, int128) {
        if (base == 0 || quote == 0) {
            return (0, 0);
        }
        int256 k = int256(base) * quote;
        // base * price * base == k
        // base = sqrt(k / price);
        base = int128(MathHelper.sqrt256((k * 1e18) / priceX18));
        quote = (base == 0) ? int128(0) : int128(k / base);
        return (base, quote);
    }

    function isSwapValid(
        int128 baseDelta,
        int128 quoteDelta,
        int128 base,
        int128 quote
    ) internal pure returns (bool) {
        if (
            base == 0 ||
            quote == 0 ||
            base + baseDelta <= 0 ||
            quote + quoteDelta <= 0
        ) {
            return false;
        }
        int256 kPrev = int256(base) * quote;
        int256 kNew = int256(base + baseDelta) * (quote + quoteDelta);
        return kNew > kPrev;
    }

    function swap(
        int128 amountSwap,
        int128 base,
        int128 quote,
        int128 priceX18,
        int128 sizeIncrement,
        int128 lpSpreadX18
    ) internal pure returns (int128, int128) {
        // (amountSwap % sizeIncrement) is guaranteed to be 0
        if (base == 0 || quote == 0) {
            return (0, 0);
        }
        int128 currentPriceX18 = quote.div(base);

        int128 keepRateX18 = 1e18 - lpSpreadX18;

        // selling
        if (amountSwap > 0) {
            priceX18 = priceX18.div(keepRateX18);
            if (priceX18 >= currentPriceX18) {
                return (0, 0);
            }
        } else {
            priceX18 = priceX18.mul(keepRateX18);
            if (priceX18 <= currentPriceX18) {
                return (0, 0);
            }
        }

        int256 k = int256(base) * quote;
        int128 baseAtPrice = int128(
            (MathHelper.sqrt256(k) * 1e9) / MathHelper.sqrt(priceX18)
        );
        // base -> base + amountSwap

        int128 baseSwapped;

        if (
            (amountSwap > 0 && base + amountSwap > baseAtPrice) ||
            (amountSwap < 0 && base + amountSwap < baseAtPrice)
        ) {
            // we hit price limits before we exhaust amountSwap
            if (baseAtPrice >= base) {
                baseSwapped = MathHelper.floor(
                    baseAtPrice - base,
                    sizeIncrement
                );
            } else {
                baseSwapped = MathHelper.ceil(
                    baseAtPrice - base,
                    sizeIncrement
                );
            }
        } else {
            // just swap it all
            // amountSwap is already guaranteed to adhere to sizeIncrement
            baseSwapped = amountSwap;
        }

        int128 quoteSwapped = int128(k / (base + baseSwapped) - quote);
        if (amountSwap > 0) {
            quoteSwapped = quoteSwapped.mul(keepRateX18);
        } else {
            quoteSwapped = quoteSwapped.div(keepRateX18);
        }
        return (baseSwapped, quoteSwapped);
    }
}
