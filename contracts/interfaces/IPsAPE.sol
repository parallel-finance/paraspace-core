// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

import "../dependencies/openzeppelin/contracts/IERC20.sol";

interface IPsAPE is IERC20 {
    function getShareByPooledApe(uint256 amount)
        external
        view
        returns (uint256);

    function getPooledApeByShares(uint256 sharesAmount)
        external
        view
        returns (uint256);
}
