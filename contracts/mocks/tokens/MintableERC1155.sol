// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import "../../dependencies/openzeppelin/contracts/ERC1155.sol";

/**
 * @title MintableERC1155
 * @dev ERC1155 minting logic
 */
contract MintableERC1155 is ERC1155 {
  constructor() ERC1155("https://MintableERC1155/") {}

  /**
   * @dev Function to mint tokens
   * @param id The id of tokens to mint.
   * @return A boolean that indicates if the operation was successful.
   */
  function mint(uint256 id, uint256 amount) public returns (bool) {
    require(id > 0, "id is zero");
    require(id <= 10, "exceed id limit");
    require(amount <= 10000000, "exceed amount limit");

    _mint(_msgSender(), id, amount, new bytes(0));
    return true;
  }

  function setURI(string memory uri_) public {
    _setURI(uri_);
  }
}
