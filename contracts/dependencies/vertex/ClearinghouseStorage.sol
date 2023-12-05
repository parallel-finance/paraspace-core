// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./interfaces/engine/IProductEngine.sol";
import "./interfaces/IFeeCalculator.sol";

abstract contract ClearinghouseStorage {
    // Each clearinghouse has a quote ERC20
    address quote;

    address clearinghouse;
    address clearinghouseLiq;

    // fee calculator
    IFeeCalculator fees;

    // Number of products registered across all engines
    uint32 numProducts;

    // product ID -> engine address
    mapping(uint32 => IProductEngine) productToEngine;
    // Type to engine address
    mapping(IProductEngine.EngineType => IProductEngine) engineByType;
    // Supported engine types
    IProductEngine.EngineType[] supportedEngines;

    // insurance stuff, consider making it its own subaccount later
    int128 public insurance;

    int128 lastLiquidationFees;
}
