// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IVaultTemplate {
    function onboardNFTs(address nft, uint32[] calldata tokenIds) external;

    function onboardNFT(address nft, uint32 tokenId) external;

    function offboardNFTs(address nft, uint32[] calldata tokenIds) external;

    function offboardNFT(address nft, uint32 tokenId) external;
}
