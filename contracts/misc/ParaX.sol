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
    string public tokenURI;

    function initialize() public initializer {
        __Ownable_init();
        __ERC721_init("ParaX Medal", "XMEDAL");
        _setTokenURI(
            "https://ipfs.io/ipfs/QmTq3Xu5VjHvozVMPvUjATq9x9G4TaAfB4KXPQsY5s13fW"
        );
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

    function setTokenURI(string memory _tokenURI) public onlyOwner {
        _setTokenURI(_tokenURI);
    }

    function _setTokenURI(string memory _tokenURI) internal {
        tokenURI = _tokenURI;
    }
}
