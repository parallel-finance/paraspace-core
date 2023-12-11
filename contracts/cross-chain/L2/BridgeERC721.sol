// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC721} from "../../dependencies/openzeppelin/contracts/ERC721.sol";
import {ERC721Enumerable} from "../../dependencies/openzeppelin/contracts/ERC721Enumerable.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";

contract BridgeERC21 is ERC721Enumerable {
    address internal immutable handler;

    modifier onlyHandler() {
        require(msg.sender == handler, Errors.ONLY_VAULT);
        _;
    }

    constructor(
        string memory name,
        string memory symbol,
        address _handler
    ) ERC721(name, symbol) {
        handler = _handler;
    }

    function mint(
        address to,
        uint256[] calldata tokenIds
    ) external onlyHandler {
        uint256 length = tokenIds.length;
        for (uint256 index = 0; index < length; index++) {
            uint256 tokenId = tokenIds[index];
            _mint(to, tokenId);
        }
    }

    function burn(
        address from,
        uint256[] calldata tokenIds
    ) external onlyHandler {
        uint256 length = tokenIds.length;
        for (uint256 index = 0; index < length; index++) {
            uint256 tokenId = tokenIds[index];
            address owner = ownerOf(tokenId);
            require(owner == from, "invalid");
            _burn(tokenId);
        }
    }
}
