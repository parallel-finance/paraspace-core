// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import "../protocol/libraries/types/DataTypes.sol";

interface ISwapAdapter {
    function getSwapInfo(bytes memory payload, bool exactInput)
        external
        view
        returns (DataTypes.SwapInfo memory);

    function swap(
        address exchange,
        bytes memory payload,
        bool exactInput
    ) external returns (uint256);
}
