// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../dependencies/openzeppelin/upgradeability/Initializable.sol";
import "../dependencies/openzeppelin/upgradeability/OwnableUpgradeable.sol";
import "../dependencies/openzeppelin/upgradeability/ERC721EnumerableUpgradeable.sol";

contract ParaX is
    Initializable,
    OwnableUpgradeable,
    ERC721EnumerableUpgradeable
{
    uint256 private tokenId;

    function initialize() public initializer {
        __Ownable_init();
        __ERC721_init("ParaX Medal", "XMEDAL");
    }

    function mint(address[] calldata users) external onlyOwner {
        uint256 userLength = users.length;
        uint256 curTokenId = tokenId;
        for (uint256 index = 0; index < userLength; index++) {
            _safeMint(users[index], curTokenId);
            curTokenId++;
        }
        tokenId = curTokenId;
    }
}
