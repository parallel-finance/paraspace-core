// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;
import "../../dependencies/openzeppelin/contracts/EnumerableSet.sol";
import "../../dependencies/openzeppelin/contracts/Ownable.sol";
import "../../dependencies/openzeppelin/contracts/IMintableERC20.sol";
import "../../dependencies/openzeppelin/contracts/Address.sol";

interface ICryptoPunksMarket {
    // Transfer ownership of a punk to another user without requiring payment
    function transferPunk(address to, uint256 punkIndex) external;

    function getPunk(uint256 punkIndex) external;

    function punksRemainingToAssign() external returns (uint256);

    function punkIndexToAddress(uint256) external returns (address);

    function balanceOf(address user) external returns (uint256);
}

interface IMintERC721 {
    function mint(uint256 _count, address _to) external;

    function mint(uint256 _count) external;

    function tokenOfOwnerByIndex(
        address owner,
        uint256 index
    ) external view returns (uint256 tokenId);

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external;
}

contract MockTokenFaucet is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    struct Token {
        string name;
        address addr;
        uint256 mintValue; // based on token decimals
    }

    ICryptoPunksMarket public cryptoPunks;

    mapping(address => Token) public tokenInfo;

    EnumerableSet.AddressSet private _mockERC20Tokens;
    EnumerableSet.AddressSet private _mockERC721Tokens;

    constructor(
        Token[] memory erc20Tokens,
        Token[] memory erc721Tokens,
        Token memory punks
    ) {
        for (uint256 index = 0; index < erc20Tokens.length; index++) {
            Token memory t = erc20Tokens[index];
            _mockERC20Tokens.add(t.addr);
            tokenInfo[t.addr] = t;
        }

        for (uint256 index = 0; index < erc721Tokens.length; index++) {
            Token memory t = erc721Tokens[index];
            _mockERC721Tokens.add(t.addr);
            tokenInfo[t.addr] = t;
        }
        cryptoPunks = ICryptoPunksMarket(punks.addr);
        tokenInfo[punks.addr] = punks;
    }

    function allMockERC20Tokens() public view returns (Token[] memory) {
        uint256 len = _mockERC20Tokens.length();
        Token[] memory tokens = new Token[](len);
        for (uint256 index = 0; index < len; index++) {
            tokens[index] = tokenInfo[_mockERC20Tokens.at(index)];
        }
        return tokens;
    }

    function allMockERC721Tokens() public view returns (Token[] memory) {
        uint256 len = _mockERC721Tokens.length();
        Token[] memory tokens = new Token[](len + 1);
        for (uint256 index = 0; index < len; index++) {
            tokens[index] = tokenInfo[_mockERC721Tokens.at(index)];
        }
        tokens[len] = tokenInfo[address(cryptoPunks)];
        return tokens;
    }

    function addERC20(Token[] calldata _tokens) public onlyOwner {
        for (uint256 index = 0; index < _tokens.length; index++) {
            Token memory t = _tokens[index];
            tokenInfo[t.addr] = t;
            _mockERC20Tokens.add(t.addr);
        }
    }

    function removeERC20(address[] memory _tokens) public onlyOwner {
        for (uint256 index = 0; index < _tokens.length; index++) {
            address addr = _tokens[index];
            _mockERC20Tokens.remove(addr);
            delete tokenInfo[addr];
        }
    }

    function addERC721(Token[] calldata _tokens) public onlyOwner {
        for (uint256 index = 0; index < _tokens.length; index++) {
            Token memory t = _tokens[index];
            tokenInfo[t.addr] = t;
            _mockERC721Tokens.add(t.addr);
        }
    }

    function updatePunk(Token calldata punk) public onlyOwner {
        tokenInfo[punk.addr] = punk;
        cryptoPunks = ICryptoPunksMarket(punk.addr);
    }

    function removeERC721(address[] memory _tokens) public onlyOwner {
        for (uint256 index = 0; index < _tokens.length; index++) {
            address addr = _tokens[index];
            _mockERC721Tokens.remove(addr);
            delete tokenInfo[addr];
        }
    }

    function mintERC20(address token, address to, uint256 mintValue) public {
        IMintableERC20 mintToken = IMintableERC20(token);
        uint256 decimals = mintToken.decimals();
        Address.functionCall(
            token,
            abi.encodeWithSignature(
                "mint(address,uint256)",
                to,
                mintValue * 10 ** decimals
            )
        );
    }

    function mintERC721(address token, address to, uint256 mintValue) public {
        IMintERC721 mintToken = IMintERC721(token);
        try mintToken.mint(mintValue, to) {
            return;
        } catch {}

        try mintToken.mint(mintValue) {
            for (uint256 index; index < mintValue; index++) {
                uint256 id = mintToken.tokenOfOwnerByIndex(address(this), 0);
                mintToken.safeTransferFrom(address(this), to, id);
            }
            return;
        } catch {}
    }

    function mintERC20s(address to) internal {
        for (uint256 index = 0; index < _mockERC20Tokens.length(); index++) {
            Token memory token = tokenInfo[_mockERC20Tokens.at(index)];
            mintERC20(token.addr, to, token.mintValue);
        }
    }

    function mintERC721s(address to) internal {
        for (uint256 index = 0; index < _mockERC721Tokens.length(); index++) {
            Token memory token = tokenInfo[_mockERC721Tokens.at(index)];
            mintERC721(token.addr, to, token.mintValue);
        }
    }

    function mintPunks(address to) internal {
        if (address(cryptoPunks) == address(0)) return;

        Token memory punksToken = tokenInfo[address(cryptoPunks)];

        if (punksToken.mintValue == 0) return;

        for (uint256 count = 0; count < punksToken.mintValue; count++) {
            uint256 punksRemainingToAssign = cryptoPunks
                .punksRemainingToAssign();
            if (punksRemainingToAssign == 0) break;
            uint256 nextPunkIndex = punksRemainingToAssign - 1;

            for (uint256 index = 0; index < 10000; index++) {
                if (
                    cryptoPunks.punkIndexToAddress(nextPunkIndex) == address(0)
                ) {
                    cryptoPunks.getPunk(nextPunkIndex);
                    cryptoPunks.transferPunk(to, nextPunkIndex);
                    break;
                }

                if (nextPunkIndex > 0) {
                    nextPunkIndex--;
                } else {
                    break;
                }
            }
        }
    }

    function mint(address to) public {
        mintERC20s(to);
        mintERC721s(to);
        mintPunks(to);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external virtual returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
