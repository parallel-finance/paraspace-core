// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./IProductEngine.sol";

interface IProductEngineState {
    /// @notice return clearinghouse addr
    function getClearinghouse() external view returns (address);

    /// @notice return productIds associated with engine
    function getProductIds() external view returns (uint32[] memory);

    /// @notice return the type of engine
    function getEngineType() external pure returns (IProductEngine.EngineType);

    /// @notice Returns orderbook for a product ID
    function getOrderbook(uint32 productId) external view returns (address);

    /// @notice Returns balance amount for some subaccount / productId
    function getBalanceAmount(uint32 productId, bytes32 subaccount)
        external
        view
        returns (int128);
}
