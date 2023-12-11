// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IBridgeERC721 {
    function mint(address to, uint256[] calldata tokenId) external;

    function burn(address from, uint256[] calldata tokenId) external;
}
