// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../dependencies/openzeppelin/contracts/ReentrancyGuard.sol";
import "../../dependencies/openzeppelin/contracts//Pausable.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import "./IVaultTemplate.sol";
import "./IVaultApeStaking.sol";

//Mock Socket Vault Implementation, Just for Testing
contract VaultTemplate is ReentrancyGuard, Pausable, IVaultTemplate {
    function onboardNFTs(address nft, uint32[] calldata tokenIds) external {
        for (uint256 index = 0; index < tokenIds.length; index++) {
            onboardNFT(nft, tokenIds[index]);
        }
    }

    function onboardNFT(address nft, uint32 tokenId) public {
        IERC721(nft).safeTransferFrom(msg.sender, address(this), tokenId);
        IVaultApeStaking(address(this)).onboardCheckApeStakingPosition(
            nft,
            tokenId,
            msg.sender
        );
    }

    //didn't check ownership here, just for testing
    function offboardNFTs(address nft, uint32[] calldata tokenIds) external {
        for (uint256 index = 0; index < tokenIds.length; index++) {
            offboardNFT(nft, tokenIds[index]);
        }
    }

    //didn't check ownership here, just for testing
    function offboardNFT(address nft, uint32 tokenId) public {
        IVaultApeStaking(address(this)).offboardCheckApeStakingPosition(
            nft,
            tokenId
        );
        IERC721(nft).safeTransferFrom(address(this), msg.sender, tokenId);
    }
}
