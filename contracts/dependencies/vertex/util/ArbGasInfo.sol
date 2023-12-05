// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

contract ArbGasInfo {
    function getL1BaseFeeEstimate() public pure returns (uint256) {
        return 0;
    }

    function getPricesInWei()
        public
        pure
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (0, 0, 0, 0, 0, 0);
    }
}
