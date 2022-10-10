// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {Context} from "../../../dependencies/openzeppelin/contracts/Context.sol";
import {Strings} from "../../../dependencies/openzeppelin/contracts/Strings.sol";
import {Address} from "../../../dependencies/openzeppelin/contracts/Address.sol";
import {IERC165} from "../../../dependencies/openzeppelin/contracts/IERC165.sol";
import {IERC721Metadata} from "../../../dependencies/openzeppelin/contracts/IERC721Metadata.sol";
import {IERC721Receiver} from "../../../dependencies/openzeppelin/contracts/IERC721Receiver.sol";
import {IERC721Enumerable} from "../../../dependencies/openzeppelin/contracts/IERC721Enumerable.sol";
import {ICollaterizableERC721} from "../../../interfaces/ICollaterizableERC721.sol";
import {IAuctionableERC721} from "../../../interfaces/IAuctionableERC721.sol";
import {SafeCast} from "../../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {WadRayMath} from "../../libraries/math/WadRayMath.sol";
import {Errors} from "../../libraries/helpers/Errors.sol";
import {IRewardController} from "../../../interfaces/IRewardController.sol";
import {IPoolAddressesProvider} from "../../../interfaces/IPoolAddressesProvider.sol";
import {IPool} from "../../../interfaces/IPool.sol";
import {IACLManager} from "../../../interfaces/IACLManager.sol";
import {DataTypes} from "../../libraries/types/DataTypes.sol";
import {ReentrancyGuard} from "../../../dependencies/openzeppelin/contracts/ReentrancyGuard.sol";

/**
 * @title MintableIncentivizedERC721
 * , inspired by the Openzeppelin ERC721 implementation
 * @notice Basic ERC721 implementation
 **/
abstract contract MintableIncentivizedERC721 is
    ReentrancyGuard,
    ICollaterizableERC721,
    IAuctionableERC721,
    Context,
    IERC721Metadata,
    IERC721Enumerable,
    IERC165
{
    using Address for address;

    /**
     * @dev Only pool admin can call functions marked by this modifier.
     **/
    modifier onlyPoolAdmin() {
        IACLManager aclManager = IACLManager(
            _addressesProvider.getACLManager()
        );
        require(
            aclManager.isPoolAdmin(msg.sender),
            Errors.CALLER_NOT_POOL_ADMIN
        );
        _;
    }

    /**
     * @dev Only pool can call functions marked by this modifier.
     **/
    modifier onlyPool() {
        require(_msgSender() == address(POOL), Errors.CALLER_MUST_BE_POOL);
        _;
    }

    /**
     * @dev UserState - additionalData is a flexible field.
     * PTokens and VariableDebtTokens use this field store the index of the
     * user's last supply/withdrawal/borrow/repayment. StableDebtTokens use
     * this field to store the user's stable rate.
     */
    struct UserState {
        uint64 balance;
        uint64 collaterizedBalance;
        uint128 additionalData;
    }

    // Token name
    string private _name;

    // Token symbol
    string private _symbol;

    // Mapping from token ID to owner address
    mapping(uint256 => address) private _owners;

    // Map of users address and their state data (userAddress => userStateData)
    mapping(address => UserState) internal _userState;

    // Mapping from token ID to approved address
    mapping(uint256 => address) private _tokenApprovals;

    // Mapping from owner to operator approvals
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    // Map of allowances (delegator => delegatee => allowanceAmount)
    mapping(address => mapping(address => uint256)) private _allowances;

    IRewardController internal _rewardController;
    IPoolAddressesProvider internal immutable _addressesProvider;
    IPool public immutable POOL;
    bool public immutable ATOMIC_PRICING;

    address internal _underlyingAsset;

    mapping(uint256 => bool) _isUsedAsCollateral;

    mapping(uint256 => DataTypes.Auction) _auctions;

    /**
     * @dev Constructor.
     * @param pool The reference to the main Pool contract
     * @param name_ The name of the token
     * @param symbol_ The symbol of the token
     */
    constructor(
        IPool pool,
        string memory name_,
        string memory symbol_,
        bool atomic_pricing
    ) {
        _addressesProvider = pool.ADDRESSES_PROVIDER();
        _name = name_;
        _symbol = symbol_;
        POOL = pool;
        ATOMIC_PRICING = atomic_pricing;
    }

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() external view override returns (string memory) {
        return _symbol;
    }

    function balanceOf(address account)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return _userState[account].balance;
    }

    /**
     * @notice Returns the address of the Incentives Controller contract
     * @return The address of the Incentives Controller
     **/
    function getIncentivesController()
        external
        view
        virtual
        returns (IRewardController)
    {
        return _rewardController;
    }

    /**
     * @notice Sets a new Incentives Controller
     * @param controller the new Incentives controller
     **/
    function setIncentivesController(IRewardController controller)
        external
        onlyPoolAdmin
    {
        _rewardController = controller;
    }

    /**
     * @notice Update the name of the token
     * @param newName The new name for the token
     */
    function _setName(string memory newName) internal {
        _name = newName;
    }

    /**
     * @notice Update the symbol for the token
     * @param newSymbol The new symbol for the token
     */
    function _setSymbol(string memory newSymbol) internal {
        _symbol = newSymbol;
    }

    /**
     * @dev See {IERC721-ownerOf}.
     */
    function ownerOf(uint256 tokenId)
        public
        view
        virtual
        override
        returns (address)
    {
        return _owners[tokenId];
    }

    /**
     * @dev See {IERC721Metadata-tokenURI}.
     */
    function tokenURI(uint256)
        external
        view
        virtual
        override
        returns (string memory)
    {
        return "";
    }

    /**
     * @dev See {IERC721-approve}.
     */
    function approve(address to, uint256 tokenId) external virtual override {
        address owner = ownerOf(tokenId);
        require(to != owner, "ERC721: approval to old owner");

        require(
            _msgSender() == owner || isApprovedForAll(owner, _msgSender()),
            "ERC721: approve caller is not owner nor approved for all"
        );

        _approve(to, tokenId);
    }

    /**
     * @dev See {IERC721-getApproved}.
     */
    function getApproved(uint256 tokenId)
        public
        view
        virtual
        override
        returns (address)
    {
        require(
            _exists(tokenId),
            "ERC721: approved query for nonexistent token"
        );

        return _tokenApprovals[tokenId];
    }

    /**
     * @dev See {IERC721-setApprovalForAll}.
     */
    function setApprovalForAll(address operator, bool approved)
        external
        virtual
        override
    {
        _setApprovalForAll(_msgSender(), operator, approved);
    }

    /**
     * @dev See {IERC721-isApprovedForAll}.
     */
    function isApprovedForAll(address owner, address operator)
        public
        view
        virtual
        override
        returns (bool)
    {
        return _operatorApprovals[owner][operator];
    }

    /**
     * @dev See {IERC721-transferFrom}.
     */
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external virtual override nonReentrant {
        //solhint-disable-next-line max-line-length
        require(
            _isApprovedOrOwner(_msgSender(), tokenId),
            "ERC721: transfer caller is not owner nor approved"
        );

        _transfer(from, to, tokenId);
    }

    /**
     * @dev See {IERC721-safeTransferFrom}.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external virtual override nonReentrant {
        _safeTransferFrom(from, to, tokenId, "");
    }

    /**
     * @dev See {IERC721-safeTransferFrom}.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
    ) external virtual override nonReentrant {
        _safeTransferFrom(from, to, tokenId, _data);
    }

    function _safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
    ) internal {
        require(
            _isApprovedOrOwner(_msgSender(), tokenId),
            "ERC721: transfer caller is not owner nor approved"
        );
        _safeTransfer(from, to, tokenId, _data);
    }

    /**
     * @dev Safely transfers `tokenId` token from `from` to `to`, checking first that contract recipients
     * are aware of the ERC721 protocol to prevent tokens from being forever locked.
     *
     * `_data` is additional data, it has no specified format and it is sent in call to `to`.
     *
     * This internal function is equivalent to {safeTransferFrom}, and can be used to e.g.
     * implement alternative mechanisms to perform token transfer, such as signature-based.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `to` cannot be the zero address.
     * - `tokenId` token must exist and be owned by `from`.
     * - If `to` refers to a smart contract, it must implement {IERC721Receiver-onERC721Received}, which is called upon a safe transfer.
     *
     * Emits a {Transfer} event.
     */
    function _safeTransfer(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
    ) internal virtual {
        _transfer(from, to, tokenId);
        require(
            _checkOnERC721Received(from, to, tokenId, _data),
            "ERC721: transfer to non ERC721Receiver implementer"
        );
    }

    /**
     * @dev Returns whether `tokenId` exists.
     *
     * Tokens can be managed by their owner or approved accounts via {approve} or {setApprovalForAll}.
     *
     * Tokens start existing when they are minted (`_mint`),
     * and stop existing when they are burned (`_burn`).
     */
    function _exists(uint256 tokenId) internal view virtual returns (bool) {
        return _owners[tokenId] != address(0);
    }

    function _isAuctioned(uint256 tokenId) internal view returns (bool) {
        return
            _auctions[tokenId].startTime >
            POOL.getUserConfiguration(ownerOf(tokenId)).auctionValidityTime;
    }

    /**
     * @dev Returns whether `spender` is allowed to manage `tokenId`.
     *
     * Requirements:
     *
     * - `tokenId` must exist.
     */
    function _isApprovedOrOwner(address spender, uint256 tokenId)
        internal
        view
        virtual
        returns (bool)
    {
        require(
            _exists(tokenId),
            "ERC721: operator query for nonexistent token"
        );
        address owner = ownerOf(tokenId);
        return (spender == owner ||
            isApprovedForAll(owner, spender) ||
            getApproved(tokenId) == spender);
    }

    function _mintMultiple(
        address to,
        DataTypes.ERC721SupplyParams[] calldata tokenData
    ) internal virtual returns (bool) {
        require(to != address(0), "ERC721: mint to the zero address");
        uint64 oldBalance = _userState[to].balance;
        uint64 oldCollaterizedBalance = _userState[to].collaterizedBalance;
        uint256 oldTotalSupply = totalSupply();
        uint64 collaterizedTokens = 0;

        uint256 length = _allTokens.length;

        for (uint256 index = 0; index < tokenData.length; index++) {
            uint256 tokenId = tokenData[index].tokenId;

            require(!_exists(tokenId), "ERC721: token already minted");

            _addTokenToAllTokensEnumeration(tokenId, length + index);
            _addTokenToOwnerEnumeration(to, tokenId, oldBalance + index);

            _owners[tokenId] = to;

            if (
                tokenData[index].useAsCollateral &&
                !_isUsedAsCollateral[tokenId]
            ) {
                _isUsedAsCollateral[tokenId] = true;
                collaterizedTokens++;
            }

            emit Transfer(address(0), to, tokenId);
        }

        _userState[to].collaterizedBalance =
            oldCollaterizedBalance +
            collaterizedTokens;

        _userState[to].balance = oldBalance + uint64(tokenData.length);
        if (ATOMIC_PRICING) {
            POOL.increaseUserTotalAtomicTokens(
                _underlyingAsset,
                to,
                uint24(tokenData.length)
            );
        }

        // calculate incentives
        IRewardController rewardControllerLocal = _rewardController;
        if (address(rewardControllerLocal) != address(0)) {
            rewardControllerLocal.handleAction(to, oldTotalSupply, oldBalance);
        }

        return (oldCollaterizedBalance == 0 && collaterizedTokens != 0);
    }

    function _burnMultiple(address user, uint256[] calldata tokenIds)
        internal
        virtual
        returns (bool allCollaterizedBurnt)
    {
        uint64 burntCollaterizedTokens = 0;
        uint64 balanceToBurn;
        uint256 oldTotalSupply = totalSupply();
        uint256 oldBalance = _userState[user].balance;

        uint64 oldCollaterizedBalance = _userState[user].collaterizedBalance;

        uint256 length = _allTokens.length;

        for (uint256 index = 0; index < tokenIds.length; index++) {
            uint256 tokenId = tokenIds[index];
            address owner = ownerOf(tokenId);
            require(owner == user, "not the owner of Ntoken");
            require(!_isAuctioned(tokenId), "token in auction");

            _removeTokenFromAllTokensEnumeration(tokenId, length - index);
            _removeTokenFromOwnerEnumeration(user, tokenId, oldBalance - index);

            // Clear approvals
            _approve(address(0), tokenId);

            balanceToBurn++;
            delete _owners[tokenId];

            if (_isUsedAsCollateral[tokenId]) {
                delete _isUsedAsCollateral[tokenId];
                burntCollaterizedTokens++;
            }
            emit Transfer(owner, address(0), tokenId);

            // _afterTokenTransfer(owner, address(0), tokenId);
        }

        _userState[user].balance -= balanceToBurn;
        _userState[user].collaterizedBalance =
            oldCollaterizedBalance -
            burntCollaterizedTokens;

        if (ATOMIC_PRICING) {
            POOL.decreaseUserTotalAtomicTokens(
                _underlyingAsset,
                user,
                uint24(tokenIds.length)
            );
        }
        // calculate incentives
        IRewardController rewardControllerLocal = _rewardController;

        if (address(rewardControllerLocal) != address(0)) {
            rewardControllerLocal.handleAction(
                user,
                oldTotalSupply,
                oldBalance
            );
        }

        return (oldCollaterizedBalance != 0 &&
            oldCollaterizedBalance == burntCollaterizedTokens);
    }

    /**
     * @dev Transfers `tokenId` from `from` to `to`.
     *  As opposed to {transferFrom}, this imposes no restrictions on msg.sender.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - `tokenId` token must be owned by `from`.
     *
     * Emits a {Transfer} event.
     */
    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual {
        require(
            ownerOf(tokenId) == from,
            "ERC721: transfer from incorrect owner"
        );
        require(to != address(0), "ERC721: transfer to the zero address");
        require(!_isAuctioned(tokenId), "token in auction");

        _beforeTokenTransfer(from, to, tokenId);

        // Clear approvals from the previous owner
        _approve(address(0), tokenId);

        uint64 oldSenderBalance = _userState[from].balance;
        _userState[from].balance = oldSenderBalance - 1;
        uint64 oldRecipientBalance = _userState[to].balance;
        _userState[to].balance = oldRecipientBalance + 1;

        if (ATOMIC_PRICING) {
            POOL.decreaseUserTotalAtomicTokens(_underlyingAsset, from, 1);
            POOL.increaseUserTotalAtomicTokens(_underlyingAsset, to, 1);
        }

        _owners[tokenId] = to;

        // TODO calculate incentives
        IRewardController rewardControllerLocal = _rewardController;
        if (address(rewardControllerLocal) != address(0)) {
            uint256 oldTotalSupply = totalSupply();
            rewardControllerLocal.handleAction(
                from,
                oldTotalSupply,
                oldSenderBalance
            );
            if (from != to) {
                rewardControllerLocal.handleAction(
                    to,
                    oldTotalSupply,
                    oldRecipientBalance
                );
            }
        }

        emit Transfer(from, to, tokenId);
    }

    /**
     * @dev Approve `to` to operate on `tokenId`
     *
     * Emits a {Approval} event.
     */
    function _approve(address to, uint256 tokenId) internal virtual {
        _tokenApprovals[tokenId] = to;
        emit Approval(ownerOf(tokenId), to, tokenId);
    }

    /**
     * @dev Approve `operator` to operate on all of `owner` tokens
     *
     * Emits a {ApprovalForAll} event.
     */
    function _setApprovalForAll(
        address owner,
        address operator,
        bool approved
    ) internal virtual {
        require(owner != operator, "ERC721: approve to caller");
        _operatorApprovals[owner][operator] = approved;
        emit ApprovalForAll(owner, operator, approved);
    }

    /**
     * @dev Internal function to invoke {IERC721Receiver-onERC721Received} on a target address.
     * The call is not executed if the target address is not a contract.
     *
     * @param from address representing the previous owner of the given token ID
     * @param to target address that will receive the tokens
     * @param tokenId uint256 ID of the token to be transferred
     * @param _data bytes optional data to send along with the call
     * @return bool whether the call correctly returned the expected magic value
     */
    function _checkOnERC721Received(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
    ) private returns (bool) {
        if (to.isContract()) {
            try
                IERC721Receiver(to).onERC721Received(
                    _msgSender(),
                    from,
                    tokenId,
                    _data
                )
            returns (bytes4 retval) {
                return retval == IERC721Receiver.onERC721Received.selector;
            } catch (bytes memory reason) {
                if (reason.length == 0) {
                    revert(
                        "ERC721: transfer to non ERC721Receiver implementer"
                    );
                } else {
                    assembly {
                        revert(add(32, reason), mload(reason))
                    }
                }
            }
        } else {
            return true;
        }
    }

    /**
     * @dev update collateral information on transfer
     */
    function _transferCollaterizable(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual returns (bool isUsedAsCollateral_) {
        isUsedAsCollateral_ = _isUsedAsCollateral[tokenId];

        if (from != to && isUsedAsCollateral_) {
            _userState[from].collaterizedBalance -= 1;
            delete _isUsedAsCollateral[tokenId];
        }

        MintableIncentivizedERC721._transfer(from, to, tokenId);
    }

    /// @inheritdoc ICollaterizableERC721
    function collaterizedBalanceOf(address account)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return _userState[account].collaterizedBalance;
    }

    /// @inheritdoc ICollaterizableERC721
    function setIsUsedAsCollateral(
        uint256 tokenId,
        bool useAsCollateral,
        address sender
    ) external virtual override onlyPool nonReentrant returns (bool) {
        return _setIsUsedAsCollateral(tokenId, useAsCollateral, sender);
    }

    /// @inheritdoc ICollaterizableERC721
    function batchSetIsUsedAsCollateral(
        uint256[] calldata tokenIds,
        bool useAsCollateral,
        address sender
    )
        external
        virtual
        override
        onlyPool
        nonReentrant
        returns (uint256 oldCollaterizedBalance, uint256 newCollaterizedBalance)
    {
        oldCollaterizedBalance = _userState[sender].collaterizedBalance;

        for (uint256 index = 0; index < tokenIds.length; index++) {
            _setIsUsedAsCollateral(tokenIds[index], useAsCollateral, sender);
        }

        newCollaterizedBalance = _userState[sender].collaterizedBalance;
    }

    function _setIsUsedAsCollateral(
        uint256 tokenId,
        bool useAsCollateral,
        address sender
    ) internal returns (bool) {
        if (_isUsedAsCollateral[tokenId] == useAsCollateral) return false;

        address owner = ownerOf(tokenId);
        require(owner == sender, "not owner");

        if (!useAsCollateral) {
            require(!_isAuctioned(tokenId), "token in auction");
        }

        uint64 collaterizedBalance = _userState[owner].collaterizedBalance;
        _isUsedAsCollateral[tokenId] = useAsCollateral;
        collaterizedBalance = useAsCollateral
            ? collaterizedBalance + 1
            : collaterizedBalance - 1;
        _userState[owner].collaterizedBalance = collaterizedBalance;

        return true;
    }

    /// @inheritdoc ICollaterizableERC721
    function isUsedAsCollateral(uint256 tokenId)
        external
        view
        override
        returns (bool)
    {
        return _isUsedAsCollateral[tokenId];
    }

    /// @inheritdoc IAuctionableERC721
    function isAuctioned(uint256 tokenId)
        external
        view
        override
        returns (bool)
    {
        return _isAuctioned(tokenId);
    }

    /// @inheritdoc IAuctionableERC721
    function startAuction(uint256 tokenId)
        external
        virtual
        override
        onlyPool
        nonReentrant
    {
        require(!_isAuctioned(tokenId), Errors.AUCTION_ALREADY_STARTED);
        require(_exists(tokenId), "ERC721: startAuction for nonexistent token");
        _auctions[tokenId] = DataTypes.Auction({startTime: block.timestamp});
    }

    /// @inheritdoc IAuctionableERC721
    function endAuction(uint256 tokenId)
        external
        virtual
        override
        onlyPool
        nonReentrant
    {
        require(_isAuctioned(tokenId), Errors.AUCTION_NOT_STARTED);
        require(_exists(tokenId), "ERC721: endAuction for nonexistent token");
        delete _auctions[tokenId];
    }

    /// @inheritdoc IAuctionableERC721
    function getAuctionData(uint256 tokenId)
        external
        view
        override
        returns (DataTypes.Auction memory auction)
    {
        if (!_isAuctioned(tokenId)) {
            auction = DataTypes.Auction({startTime: 0});
        } else {
            auction = _auctions[tokenId];
        }
    }

    // Mapping from owner to list of owned token IDs
    mapping(address => mapping(uint256 => uint256)) private _ownedTokens;

    // Mapping from token ID to index of the owner tokens list
    mapping(uint256 => uint256) private _ownedTokensIndex;

    // Array with all token ids, used for enumeration
    uint256[] private _allTokens;

    // Mapping from token id to position in the allTokens array
    mapping(uint256 => uint256) private _allTokensIndex;

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId)
        external
        view
        virtual
        override(IERC165)
        returns (bool)
    {
        return
            interfaceId == type(IERC721Enumerable).interfaceId ||
            interfaceId == type(IERC721Metadata).interfaceId;
    }

    /**
     * @dev See {IERC721Enumerable-tokenOfOwnerByIndex}.
     */
    function tokenOfOwnerByIndex(address owner, uint256 index)
        external
        view
        virtual
        override
        returns (uint256)
    {
        require(
            index < balanceOf(owner),
            "ERC721Enumerable: owner index out of bounds"
        );
        return _ownedTokens[owner][index];
    }

    /**
     * @dev See {IERC721Enumerable-totalSupply}.
     */
    function totalSupply() public view virtual override returns (uint256) {
        return _allTokens.length;
    }

    /**
     * @dev See {IERC721Enumerable-tokenByIndex}.
     */
    function tokenByIndex(uint256 index)
        external
        view
        virtual
        override
        returns (uint256)
    {
        require(
            index < totalSupply(),
            "ERC721Enumerable: global index out of bounds"
        );
        return _allTokens[index];
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
    ) internal virtual {
        // super._beforeTokenTransfer(from, to, tokenId);

        // TODO remove the if (from == 0) and (to == 0) since they are handled in mint and burn already
        if (from == address(0)) {
            uint256 length = _allTokens.length;
            _addTokenToAllTokensEnumeration(tokenId, length);
        } else if (from != to) {
            uint256 userBalance = balanceOf(from);
            _removeTokenFromOwnerEnumeration(from, tokenId, userBalance);
        }
        if (to == address(0)) {
            uint256 length = _allTokens.length;
            _removeTokenFromAllTokensEnumeration(tokenId, length);
        } else if (to != from) {
            uint256 length = balanceOf(to);
            _addTokenToOwnerEnumeration(to, tokenId, length);
        }
    }

    /**
     * @dev Private function to add a token to this extension's ownership-tracking data structures.
     * @param to address representing the new owner of the given token ID
     * @param tokenId uint256 ID of the token to be added to the tokens list of the given address
     */
    function _addTokenToOwnerEnumeration(
        address to,
        uint256 tokenId,
        uint256 length
    ) private {
        _ownedTokens[to][length] = tokenId;
        _ownedTokensIndex[tokenId] = length;
    }

    /**
     * @dev Private function to add a token to this extension's token tracking data structures.
     * @param tokenId uint256 ID of the token to be added to the tokens list
     */
    function _addTokenToAllTokensEnumeration(uint256 tokenId, uint256 length)
        private
    {
        _allTokensIndex[tokenId] = length;
        _allTokens.push(tokenId);
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
        uint256 tokenId,
        uint256 userBalance
    ) private {
        // To prevent a gap in from's tokens array, we store the last token in the index of the token to delete, and
        // then delete the last slot (swap and pop).

        uint256 lastTokenIndex = userBalance - 1;
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

    /**
     * @dev Private function to remove a token from this extension's token tracking data structures.
     * This has O(1) time complexity, but alters the order of the _allTokens array.
     * @param tokenId uint256 ID of the token to be removed from the tokens list
     */
    function _removeTokenFromAllTokensEnumeration(
        uint256 tokenId,
        uint256 length
    ) private {
        // To prevent a gap in the tokens array, we store the last token in the index of the token to delete, and
        // then delete the last slot (swap and pop).

        uint256 lastTokenIndex = length - 1;
        uint256 tokenIndex = _allTokensIndex[tokenId];

        // When the token to delete is the last token, the swap operation is unnecessary. However, since this occurs so
        // rarely (when the last minted token is burnt) that we still do the swap here to avoid the gas cost of adding
        // an 'if' statement (like in _removeTokenFromOwnerEnumeration)
        uint256 lastTokenId = _allTokens[lastTokenIndex];

        _allTokens[tokenIndex] = lastTokenId; // Move the last token to the slot of the to-delete token
        _allTokensIndex[lastTokenId] = tokenIndex; // Update the moved token's index

        // This also deletes the contents at the last position of the array
        delete _allTokensIndex[tokenId];
        _allTokens.pop();
    }
}
