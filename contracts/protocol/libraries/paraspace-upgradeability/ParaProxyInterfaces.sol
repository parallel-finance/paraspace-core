// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
/******************************************************************************\
* EIP-2535 Diamonds: https://eips.ethereum.org/EIPS/eip-2535
/******************************************************************************/

import {IParaProxyInterfaces} from "../../../interfaces/IParaProxyInterfaces.sol";
import {IERC165} from "../../../dependencies/openzeppelin/contracts/IERC165.sol";
import {ParaProxyLib} from "./lib/ParaProxyLib.sol";

// The EIP-2535 Diamond standard requires these functions.

contract ParaProxyInterfaces is IParaProxyInterfaces, IERC165 {
    ////////////////////////////////////////////////////////////////////
    /// These functions are expected to be called frequently by tools.
    // Facet == Implementtion

    /// @notice Gets all facets and their selectors.
    /// @return facets_ Implementation
    function facets() external override view returns (Implementation[] memory facets_) {
        ParaProxyLib.ProxyStorage storage ds = ParaProxyLib.diamondStorage();
        uint256 numFacets = ds.implementationAddresses.length;
        facets_ = new Implementation[](numFacets);
        for (uint256 i; i < numFacets; i++) {
            address facetAddress_ = ds.implementationAddresses[i];
            facets_[i].implAddress = facetAddress_;
            facets_[i].functionSelectors = ds.implementationFunctionSelectors[facetAddress_].functionSelectors;
        }
    }

    /// @notice Gets all the function selectors provided by a facet.
    /// @param _facet The facet address.
    /// @return facetFunctionSelectors_
    function facetFunctionSelectors(address _facet) external override view returns (bytes4[] memory facetFunctionSelectors_) {
        ParaProxyLib.ProxyStorage storage ds = ParaProxyLib.diamondStorage();
        facetFunctionSelectors_ = ds.implementationFunctionSelectors[_facet].functionSelectors;
    }

    /// @notice Get all the facet addresses used by a diamond.
    /// @return facetAddresses_
    function facetAddresses() external override view returns (address[] memory facetAddresses_) {
        ParaProxyLib.ProxyStorage storage ds = ParaProxyLib.diamondStorage();
        facetAddresses_ = ds.implementationAddresses;
    }

    /// @notice Gets the facet that supports the given selector.
    /// @dev If facet is not found return address(0).
    /// @param _functionSelector The function selector.
    /// @return facetAddress_ The facet address.
    function facetAddress(bytes4 _functionSelector) external override view returns (address facetAddress_) {
        ParaProxyLib.ProxyStorage storage ds = ParaProxyLib.diamondStorage();
        facetAddress_ = ds.selectorToImplAndPosition[_functionSelector].implAddress;
    }

    // This implements ERC-165.
    function supportsInterface(bytes4 _interfaceId) external override view returns (bool) {
        ParaProxyLib.ProxyStorage storage ds = ParaProxyLib.diamondStorage();
        return ds.supportedInterfaces[_interfaceId];
    }

    // initialize the contracts. it's okay for it to be called by anyone
    function initialize() external {
        ParaProxyLib.ProxyStorage storage ds = ParaProxyLib.diamondStorage();

        ds.supportedInterfaces[type(IParaProxyInterfaces).interfaceId] = true;
    }
}