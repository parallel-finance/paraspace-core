// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.10;

import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

interface ISwapProvider {
    function getSwapAdapter(bytes32 id)
        external
        view
        returns (DataTypes.SwapAdapter memory);

    function setSwapAdapter(
        bytes32 id,
        DataTypes.SwapAdapter calldata swapAdapter
    ) external;
}
