// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import {ERC721Enumerable, ERC721} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {IERC6551Registry} from "./interfaces/IERC6551Registry.sol";

contract ParaAccount is ERC721Enumerable {
    IERC6551Registry immutable registry;
    uint256 lastTokenId = 1;

    constructor(IERC6551Registry registry_) ERC721("ParaAccount", "PACT") {
        registry = registry_;
    }

    function createAccount(address to_, address implementation_) external {
        uint256 tokenId = lastTokenId;
        _mint(to_, tokenId);

        registry.createAccount(
            implementation_,
            block.chainid,
            address(this),
            tokenId,
            block.number,
            abi.encodeWithSignature("initialize()")
        );

        lastTokenId = tokenId + 1;
    }
}
