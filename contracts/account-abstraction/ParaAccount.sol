// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import {ERC721Enumerable, ERC721} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {IERC6551Registry} from "./interfaces/IERC6551Registry.sol";

contract ParaAccount is ERC721Enumerable {
    uint256 constant SALT = uint256(keccak256(abi.encodePacked("PARAWALLET")));

    IERC6551Registry immutable registry;

    uint256 lastTokenId = 1;
    mapping(address => address) public accountTokenOwner;
    mapping(uint256 => address) public accountToken;

    constructor(IERC6551Registry registry_) ERC721("ParaAccount", "PACT") {
        registry = registry_;
    }

    function createAccount(address to_, address implementation_) external {
        uint256 tokenId = lastTokenId;

        address account = registry.createAccount(
            implementation_,
            block.chainid,
            address(this),
            tokenId,
            SALT,
            abi.encodeWithSignature("initialize()")
        );
        accountToken[tokenId] = account;

        _mint(to_, tokenId);
        lastTokenId = tokenId + 1;
    }

    function getAccount(uint256 tokenId, address implementation_)
        external
        view
        returns (address account)
    {
        return
            registry.account(
                implementation_,
                block.chainid,
                address(this),
                tokenId,
                SALT
            );
    }

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal virtual override {
        super._afterTokenTransfer(from, to, firstTokenId, batchSize);

        if (from != to) {
            accountTokenOwner[accountToken[firstTokenId]] = to;
        }
    }
}
