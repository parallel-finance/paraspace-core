// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import "../../dependencies/openzeppelin/contracts/ERC721Enumerable.sol";

/**
 * @title MintableERC721
 * @dev ERC721 minting logic
 */
contract AirdropMintableERC721 is ERC721Enumerable {
    string public baseURI;

    constructor(string memory name, string memory symbol) ERC721(name, symbol) {
        baseURI = "https://MintableERC721/";
    }

    /**
     * @dev Function to mint tokens
   * @param tokenId The id of tokens to mint.
   * @return A boolean that indicates if the operation was successful.
   */
    function mint(uint256 tokenId) public returns (bool) {
        require(tokenId < 10000, "exceed id limit");

        _mint(_msgSender(), tokenId);
        return true;
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return baseURI;
    }

    function setBaseURI(string memory baseURI_) public {
        baseURI = baseURI_;
    }
}
