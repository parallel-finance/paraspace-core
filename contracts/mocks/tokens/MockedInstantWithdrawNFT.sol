// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import "../../interfaces/IInstantWithdrawNFT.sol";
import "./MintableERC1155.sol";

contract MockedInstantWithdrawNFT is MintableERC1155, IInstantWithdrawNFT {
    function burn(uint256 tokenId, uint256 amount) external {
        _burn(msg.sender, tokenId, amount);
    }

    receive() external payable {}
}
