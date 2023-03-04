// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import "../../interfaces/IInstantWithdrawNFT.sol";
import "./MintableERC721.sol";

contract MockedInstantWithdrawNFT is MintableERC721, IInstantWithdrawNFT {
    constructor(
        string memory name,
        string memory symbol,
        string memory baseTokenURI
    ) MintableERC721(name, symbol, baseTokenURI) {
    }

    function burn(uint256 tokenId) external {
        _burn(tokenId);
    }

    receive() external payable {}
}
