// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

interface INTokenDelegation {
    /**
     * @notice Allow the delegate to act on your behalf for a specific token
     * @param delegate The hotwallet to act on your behalf
     * @param tokenId The token id for the token you're delegating
     * @param value Whether to enable or disable delegation for this address, true for setting and false for revoking
     */
    function delegateForToken(
        address delegate,
        uint256 tokenId,
        bool value
    ) external;
}
