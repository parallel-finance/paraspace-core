// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {Ownable} from "../../../contracts/dependencies/openzeppelin/contracts/Ownable.sol";

import {IERC721} from "../../../contracts/dependencies/openzeppelin/contracts/IERC721.sol";
import {ERC721} from "../../../contracts/dependencies/openzeppelin/contracts/ERC721.sol";

import {IERC20} from "../../../contracts/dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC165} from "../../../contracts/dependencies/openzeppelin/contracts/IERC165.sol";


//      |||||\          |||||\               |||||\           |||||\
//      ||||| |         ||||| |              ||||| |          ||||| |
//       \__|||||\  |||||\___\|               \__|||||\   |||||\___\|
//          ||||| | ||||| |                      ||||| |  ||||| |
//           \__|||||\___\|       Y u g a         \__|||||\___\|
//              ||||| |             L a b s          ||||| |
//          |||||\___\|          Sewer Pass      |||||\___\|
//          ||||| |                              ||||| |
//           \__|||||||||||\                      \__|||||||||||\
//              ||||||||||| |                        ||||||||||| |
//               \_________\|                         \_________\|

error MintIsNotActive();
error BurnIsNotActive();
error UnauthorizedOwnerOfToken();
error NotAllowedToMint();
error ContractIsLocked();
error UnableToLockContract();
error MaxTokensMinted();
error TokenIdDoesNotExist();
error RegistryAddressIsNotSet();
error OnlyOperatorError();
error OperatorZeroAddressCheck();

contract Operator is Ownable {
    address public operator;

    event OperatorChanged(address operator);

    modifier onlyOperator() {
        if (operator != _msgSender()) revert OnlyOperatorError();
        _;
    }

    constructor(address _operator) {
        if (_operator == address(0)) revert OperatorZeroAddressCheck();
        operator = _operator;
    }

    /**
     * @notice change operator
     */
    function setOperator(address _operator) external onlyOwner {
        if (_operator == address(0)) revert OperatorZeroAddressCheck();

        operator = _operator;
        emit OperatorChanged(_operator);
    }
}




/**
 * @title ERC-721 Non-Fungible Token Standard, partial implementation of
 * optional enumeration extension
 * @dev See https://eips.ethereum.org/EIPS/eip-721
 */
interface IERC721EnumerableMod is IERC721 {
    /**
     * @dev Returns a token ID owned by `owner` at a given `index` of its token list.
     * Use along with {balanceOf} to enumerate all of ``owner``'s tokens.
     */
    function tokenOfOwnerByIndex(
        address owner,
        uint256 index
    ) external view returns (uint256 tokenId);
}

/**
 * @dev gas optimized version of the OpenZepplin ERC721Enumerable Extension -
 * This implements a partial optional extension of {ERC721} defined in the EIP that:
 * keeps - enumerability of all the token ids owned by each account.
 * removes - enumerability of all the token ids in the contract and totalSupply function
 * WARNING: You have to code your own totalSupply function
 */
abstract contract ERC721EnumerableMod is ERC721, IERC721EnumerableMod {
    // Mapping from owner to list of owned token IDs
    mapping(address => mapping(uint256 => uint256)) private _ownedTokens;

    // Mapping from token ID to index of the owner tokens list
    mapping(uint256 => uint256) private _ownedTokensIndex;

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC721) returns (bool) {
        return
            interfaceId == type(IERC721EnumerableMod).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @dev See {IERC721Enumerable-tokenOfOwnerByIndex}.
     */
    function tokenOfOwnerByIndex(
        address owner,
        uint256 index
    ) public view virtual override returns (uint256) {
        require(
            index < ERC721.balanceOf(owner),
            "ERC721Enumerable: owner index out of bounds"
        );
        return _ownedTokens[owner][index];
    }

    /**
     * @dev Hook that is called before any token transfer. This includes minting
     * and burning.
     *
     * Calling conditions:
     *
     * - When `from` and `to` are both non-zero, ``from``'s `tokenId` will be
     * transferred to `to`.
     * - When `from` is zero, `tokenId` will be minted for `to`.
     * - When `to` is zero, ``from``'s `tokenId` will be burned.
     * - `from` cannot be the zero address.
     * - `to` cannot be the zero address.
     *
     * To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, tokenId);

        if (from != address(0) && from != to) {
            _removeTokenFromOwnerEnumeration(from, tokenId);
        }
        if (to != address(0) && to != from) {
            _addTokenToOwnerEnumeration(to, tokenId);
        }
    }

    /**
     * @dev Private function to add a token to this extension's ownership-tracking data structures.
     * @param to address representing the new owner of the given token ID
     * @param tokenId uint256 ID of the token to be added to the tokens list of the given address
     */
    function _addTokenToOwnerEnumeration(address to, uint256 tokenId) private {
        uint256 length = ERC721.balanceOf(to);
        _ownedTokens[to][length] = tokenId;
        _ownedTokensIndex[tokenId] = length;
    }

    /**
     * @dev Private function to remove a token from this extension's ownership-tracking data structures. Note that
     * while the token is not assigned a new owner, the `_ownedTokensIndex` mapping is _not_ updated: this allows for
     * gas optimizations e.g. when performing a transfer operation (avoiding double writes).
     * This has O(1) time complexity, but alters the order of the _ownedTokens array.
     * @param from address representing the previous owner of the given token ID
     * @param tokenId uint256 ID of the token to be removed from the tokens list of the given address
     */
    function _removeTokenFromOwnerEnumeration(
        address from,
        uint256 tokenId
    ) private {
        // To prevent a gap in from's tokens array, we store the last token in the index of the token to delete, and
        // then delete the last slot (swap and pop).

        uint256 lastTokenIndex = ERC721.balanceOf(from) - 1;
        uint256 tokenIndex = _ownedTokensIndex[tokenId];

        // When the token to delete is the last token, the swap operation is unnecessary
        if (tokenIndex != lastTokenIndex) {
            uint256 lastTokenId = _ownedTokens[from][lastTokenIndex];

            _ownedTokens[from][tokenIndex] = lastTokenId; // Move the last token to the slot of the to-delete token
            _ownedTokensIndex[lastTokenId] = tokenIndex; // Update the moved token's index
        }

        // This also deletes the contents at the last position of the array
        delete _ownedTokensIndex[tokenId];
        delete _ownedTokens[from][lastTokenIndex];
    }
}

/**
 * @title BAYC Sewer Pass ERC-721 Smart Contract
 */
contract BAYCSewerPass is ERC721EnumerableMod, Operator {
    uint64 private _totalSupply;
    uint64 public mintIndex;
    uint64 public constant MAX_TOKENS = 30000;
    address public registryAddress;
    bool public mintIsActive;
    bool public burnIsActive;
    bool public contractIsLocked;
    bool public isRegistryActive;
    string private baseURI;
    string public nftLicenseTerms = "https://mdvmm.xyz/license";
    bytes32 public metadataHash;
    mapping(address => bool) public minters;
    mapping(uint256 => uint256) public tokenIdtoMintData;

    constructor(
        string memory name,
        string memory symbol,
        address operator
    ) ERC721(name, symbol) Operator(operator) {}

    /**
     * @notice Mint a Sewer Pass
     * can only be called by approved contracts
     * @param to address of minting contract
     * @param mintData data from the token mint stored in uint256
     *  | dogTokenId | apeTokenId | tier |
     * 192          128           64     0
     */
    function mintSewerPass(
        address to,
        uint256 mintData
    ) external returns (uint256) {
        if (!mintIsActive) revert MintIsNotActive();
        if (_totalSupply >= MAX_TOKENS) revert MaxTokensMinted();
        if (!minters[_msgSender()]) revert NotAllowedToMint();

        uint256 _mintIndex = mintIndex;
        ++mintIndex;
        ++_totalSupply;
        tokenIdtoMintData[_mintIndex] = mintData;
        _safeMint(to, _mintIndex);

        return _mintIndex;
    }

    /**
     * @notice Get the data from token mint by token id
     * @param tokenId the token id
     * @return tier game pass tier
     * @return apeTokenId tier 1 & 2 mayc token id, tier 3 & 4 bayc token id
     * @return dogTokenId bakc token id, if 10000 dog was not used in claim
     */
    function getMintDataByTokenId(
        uint256 tokenId
    )
        external
        view
        returns (uint256 tier, uint256 apeTokenId, uint256 dogTokenId)
    {
        if (!_exists(tokenId)) revert TokenIdDoesNotExist();

        uint256 mintData = tokenIdtoMintData[tokenId];
        tier = uint256(uint64(mintData));
        apeTokenId = uint256(uint64(mintData >> 64));
        dogTokenId = uint256(uint64(mintData >> 128));
    }

    /**
     * @notice Get token ids by wallet
     * @param _owner the address of the owner
     */
    function tokenIdsByWallet(
        address _owner
    ) external view returns (uint256[] memory) {
        uint256 tokenCount = balanceOf(_owner);

        uint256[] memory tokenIds = new uint256[](tokenCount);
        for (uint256 i; i < tokenCount; i++) {
            tokenIds[i] = tokenOfOwnerByIndex(_owner, i);
        }
        return tokenIds;
    }

    /**
     * @notice Check if a token exists
     */
    function exists(uint256 tokenId) external view returns (bool) {
        return _exists(tokenId);
    }

    /**
     * @notice Get the total supply of tokens
     */
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    // operator functions

    /**
     * @notice Flip mint state
     */
    function flipMintIsActiveState() external onlyOperator {
        if (contractIsLocked) revert ContractIsLocked();
        mintIsActive = !mintIsActive;
    }

    /**
     * @notice Flip burn state
     */
    function flipBurnIsActiveState() external onlyOperator {
        if (contractIsLocked) revert ContractIsLocked();
        burnIsActive = !burnIsActive;
    }

    /**
     * @notice Lock the contract - stops minting, contract burn,
     * flipping burn state, and adding minter contracts
     * KILL SWITCH - THIS CAN'T BE REVERSED
     */
    function lockContract() external onlyOperator {
        if (mintIsActive) revert UnableToLockContract();
        contractIsLocked = true;
    }

    /**
     * @notice Set base uri of metadata
     * @param uri the base uri of the metadata store
     */
    function setBaseURI(string memory uri) external onlyOperator {
        baseURI = uri;
    }

    /**
     * @notice Toggle the minting ability of a minter contract
     * @param _minterContract address of contract
     */
    function toggleMinterContract(
        address _minterContract
    ) external onlyOperator {
        if (contractIsLocked) revert ContractIsLocked();
        minters[_minterContract] = !minters[_minterContract];
    }

    /**
     * @notice Set the metadata provenance hash
     * @param _metadataHash hash of metadata
     */
    function setMetadataHash(bytes32 _metadataHash) external onlyOperator {
        metadataHash = _metadataHash;
    }

    /**
     * @notice Set NFT License URI
     * @param _nftLicenseUri the uri to license
     */
    function setNftLicenseTerms(
        string memory _nftLicenseUri
    ) external onlyOperator {
        nftLicenseTerms = _nftLicenseUri;
    }

    /**
     * @notice Withdraw erc-20 tokens sent to the contract by error
     * @param coinContract the erc-20 contract address
     */
    function withdraw(address coinContract) external onlyOperator {
        uint256 balance = IERC20(coinContract).balanceOf(address(this));
        if (balance > 0) {
            IERC20(coinContract).transfer(operator, balance);
        }
    }

    /**
     * @notice Set the registry contract
     * @param _registryAddress Contract address for registry
     */
    function setRegistryAddress(
        address _registryAddress
    ) external onlyOperator {
        registryAddress = _registryAddress;
    }

    /**
     * @param isActive Enables or disables the registry
     */
    function setIsRegistryActive(bool isActive) external onlyOperator {
        if (registryAddress == address(0)) revert RegistryAddressIsNotSet();
        isRegistryActive = isActive;
    }

    // Internal function

    /**
     * @notice Checks whether caller is valid on the registry
     */
    function _isValidAgainstRegistry(
        address operator
    ) internal view returns (bool) {
        return true;
    }

    // Function overrides

    /**
     * @notice override _baseURI function
     */
    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    /**
     * @notice Overrides beforeTokenTransfer and triggers before any transfer
     * @param from From address
     * @param to Address being transfered to
     * @param tokenId Token id being transferred
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    // Token burning

    /**
     * @notice check if sender is approved to burn token
     *      includes token ownership and contract burn checks
     *  @param tokenId token id to check for burn approval
     */
    function _isApprovedToBurn(uint256 tokenId) private view returns (bool) {
        if (!contractIsLocked && minters[_msgSender()]) {
            return true;
        } else if (_isApprovedOrOwner(_msgSender(), tokenId)) {
            return true;
        }
        return false;
    }

    /**
     * @notice burn the token
     * @param tokenId token id to burn
     */
    function burn(uint256 tokenId) public virtual {
        if (!burnIsActive) revert BurnIsNotActive();
        if (!_isApprovedToBurn(tokenId)) revert UnauthorizedOwnerOfToken();
        --_totalSupply;
        _burn(tokenId);
    }
}