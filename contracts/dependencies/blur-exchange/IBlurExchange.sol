// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {Input, Order} from "./OrderStructs.sol";
import "./IExecutionDelegate.sol";
import "./IPolicyManager.sol";

interface IBlurExchange {
    function nonces(address) external view returns (uint256);

    function close() external;

    function setExecutionDelegate(IExecutionDelegate _executionDelegate) external;

    function setPolicyManager(IPolicyManager _policyManager) external;

    function setOracle(address _oracle) external;

    function setBlockRange(uint256 _blockRange) external;

    function cancelOrder(Order calldata order) external;

    function cancelOrders(Order[] calldata orders) external;

    function incrementNonce() external;

    function execute(Input calldata sell, Input calldata buy)
        external
        payable;
}
