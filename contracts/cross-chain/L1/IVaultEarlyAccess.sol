// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IVaultEarlyAccess {
    function depositERC721(address nft, uint32[] calldata tokenIds) external;

    //    function offboardNFTs(address nft, uint32[] calldata tokenIds) external;
    //
    //    function offboardNFT(address nft, uint32 tokenId) external;
}
