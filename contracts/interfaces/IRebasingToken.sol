// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

interface IRebasingToken {
    /**
     * @return Current rebasing index in RAY
     **/
    function lastRebasingIndex() external view returns (uint256);
}
