// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

interface IDynamicConfigsStrategy {
    function getConfigParams(uint256 data)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        );
}
