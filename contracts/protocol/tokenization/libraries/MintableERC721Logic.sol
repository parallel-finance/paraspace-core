// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;
import {ApeCoinStaking} from "../../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {IERC721} from "../../../dependencies/openzeppelin/contracts/IERC721.sol";
import {SafeERC20} from "../../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {SafeCast} from "../../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {WadRayMath} from "../../libraries/math/WadRayMath.sol";
import {Helpers} from "../../libraries/helpers/Helpers.sol";
import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";
import "../../../interfaces/IRewardController.sol";
import "../../libraries/types/DataTypes.sol";
import "../../../interfaces/IPool.sol";
import {Errors} from "../../libraries/helpers/Errors.sol";

struct UserState {
    uint64 balance;
    uint64 collateralizedBalance;
    uint128 additionalData;
    uint256 avgMultiplier;
}

struct MintableERC721Data {
    // Token name
    string name;
    // Token symbol
    string symbol;
    // Mapping from token ID to owner address
    mapping(uint256 => address) owners;
    // Mapping from owner to list of owned token IDs
    mapping(address => mapping(uint256 => uint256)) ownedTokens;
    // Mapping from token ID to index of the owner tokens list
    mapping(uint256 => uint256) ownedTokensIndex;
    // Array with all token ids, used for enumeration
    uint256[] allTokens;
    // Mapping from token id to position in the allTokens array
    mapping(uint256 => uint256) allTokensIndex;
    // Map of users address and their state data (userAddress => userStateData)
    mapping(address => UserState) userState;
    // Mapping from token ID to approved address
    mapping(uint256 => address) tokenApprovals;
    // Mapping from owner to operator approvals
    mapping(address => mapping(address => bool)) operatorApprovals;
    // Map of allowances (delegator => delegatee => allowanceAmount)
    mapping(address => mapping(address => uint256)) allowances;
    IRewardController rewardController;
    uint64 balanceLimit;
    mapping(uint256 => bool) isUsedAsCollateral;
    mapping(uint256 => DataTypes.Auction) auctions;
    address underlyingAsset;
    mapping(uint256 => uint256) traitsMultipliers;
}

struct LocalVars {
    uint64 oldBalance;
    uint64 oldCollateralizedBalance;
    uint64 collateralizedTokens;
}

/**
 * @title MintableERC721 library
 *
 * @notice Implements the base logic for MintableERC721
 */
library MintableERC721Logic {
    using SafeCast for uint256;
    /**
     * @dev This constant represents the maximum trait multiplier that a single tokenId can have
     * A value of 10e18 results in 10x of price
     */
    uint256 internal constant MAX_TRAIT_MULTIPLIER = 10e18;
    /**
     * @dev This constant represents the minimum trait multiplier that a single tokenId can have
     * A value of 1e18 results in no price multiplier
     */
    uint256 internal constant MIN_TRAIT_MULTIPLIER = 0e18;

    /**
     * @dev Emitted when `tokenId` token is transferred from `from` to `to`.
     */
    event Transfer(
        address indexed from,
        address indexed to,
        uint256 indexed tokenId
    );

    /**
     * @dev Emitted when `owner` enables `approved` to manage the `tokenId` token.
     */
    event Approval(
        address indexed owner,
        address indexed approved,
        uint256 indexed tokenId
    );

    /**
     * @dev Emitted when `owner` enables or disables (`approved`) `operator` to manage all of its assets.
     */
    event ApprovalForAll(
        address indexed owner,
        address indexed operator,
        bool approved
    );

    function executeTransfer(
        MintableERC721Data storage erc721Data,
        IPool POOL,
        bool,
        address from,
        address to,
        uint256 tokenId
    ) public {
        require(
            erc721Data.owners[tokenId] == from,
            "ERC721: transfer from incorrect owner"
        );
        require(to != address(0), "ERC721: transfer to the zero address");
        require(
            !isAuctioned(erc721Data, POOL, tokenId),
            Errors.TOKEN_IN_AUCTION
        );
        _beforeTokenTransfer(erc721Data, from, to, tokenId);

        // Clear approvals from the previous owner
        _approve(erc721Data, address(0), tokenId);

        uint64 oldSenderBalance = erc721Data.userState[from].balance;
        erc721Data.userState[from].balance = oldSenderBalance - 1;
        uint64 oldRecipientBalance = erc721Data.userState[to].balance;
        erc721Data.userState[to].balance = oldRecipientBalance + 1;
        erc721Data.owners[tokenId] = to;

        if (from != to && erc721Data.auctions[tokenId].startTime > 0) {
            delete erc721Data.auctions[tokenId];
        }

        IRewardController rewardControllerLocal = erc721Data.rewardController;
        if (address(rewardControllerLocal) != address(0)) {
            uint256 oldTotalSupply = erc721Data.allTokens.length;
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

    function executeTransferCollateralizable(
        MintableERC721Data storage erc721Data,
        IPool POOL,
        bool atomic_pricing,
        address from,
        address to,
        uint256 tokenId
    ) external returns (bool isUsedAsCollateral_) {
        isUsedAsCollateral_ = erc721Data.isUsedAsCollateral[tokenId];

        if (from != to && isUsedAsCollateral_) {
            _executeUpdateTraitMultiplier(
                erc721Data,
                tokenId,
                -getTraitMultiplier(erc721Data, tokenId).toInt256(),
                -1
            );
            erc721Data.userState[from].collateralizedBalance -= 1;
            delete erc721Data.isUsedAsCollateral[tokenId];
        }

        executeTransfer(erc721Data, POOL, atomic_pricing, from, to, tokenId);
    }

    function executeSetIsUsedAsCollateral(
        MintableERC721Data storage erc721Data,
        IPool POOL,
        bool,
        uint256 tokenId,
        bool useAsCollateral,
        address sender
    ) internal returns (bool) {
        if (erc721Data.isUsedAsCollateral[tokenId] == useAsCollateral)
            return false;

        address owner = erc721Data.owners[tokenId];
        require(owner == sender, "not owner");

        if (!useAsCollateral) {
            require(
                !isAuctioned(erc721Data, POOL, tokenId),
                Errors.TOKEN_IN_AUCTION
            );
        }

        _executeUpdateTraitMultiplier(
            erc721Data,
            tokenId,
            useAsCollateral
                ? getTraitMultiplier(erc721Data, tokenId).toInt256()
                : -getTraitMultiplier(erc721Data, tokenId).toInt256(),
            useAsCollateral ? int64(1) : int64(-1)
        );
        uint64 collateralizedBalance = erc721Data
            .userState[owner]
            .collateralizedBalance;
        erc721Data.isUsedAsCollateral[tokenId] = useAsCollateral;
        collateralizedBalance = useAsCollateral
            ? collateralizedBalance + 1
            : collateralizedBalance - 1;

        erc721Data
            .userState[owner]
            .collateralizedBalance = collateralizedBalance;

        return true;
    }

    function executeMintMultiple(
        MintableERC721Data storage erc721Data,
        bool atomic_pricing,
        address to,
        DataTypes.ERC721SupplyParams[] calldata tokenData
    ) external returns (uint64, uint64) {
        require(to != address(0), "ERC721: mint to the zero address");
        LocalVars memory vars = _cache(erc721Data, to);
        uint256 oldTotalSupply = erc721Data.allTokens.length;

        for (uint256 index = 0; index < tokenData.length; index++) {
            uint256 tokenId = tokenData[index].tokenId;

            require(
                !_exists(erc721Data, tokenId),
                "ERC721: token already minted"
            );

            _addTokenToAllTokensEnumeration(
                erc721Data,
                tokenId,
                oldTotalSupply + index
            );
            _addTokenToOwnerEnumeration(
                erc721Data,
                to,
                tokenId,
                vars.oldBalance + index
            );

            erc721Data.owners[tokenId] = to;

            if (
                tokenData[index].useAsCollateral &&
                !erc721Data.isUsedAsCollateral[tokenId]
            ) {
                erc721Data.isUsedAsCollateral[tokenId] = true;
                vars.collateralizedTokens++;
                uint256 multiplier = getTraitMultiplier(erc721Data, tokenId);
                _executeUpdateTraitMultiplier(
                    erc721Data,
                    tokenId,
                    multiplier.toInt256(),
                    int64(1)
                );
            }

            emit Transfer(address(0), to, tokenId);
        }

        uint64 newCollateralizedBalance = vars.oldCollateralizedBalance +
            vars.collateralizedTokens;
        erc721Data
            .userState[to]
            .collateralizedBalance = newCollateralizedBalance;

        uint64 newBalance = vars.oldBalance + uint64(tokenData.length);
        _checkBalanceLimit(erc721Data, atomic_pricing, newBalance);
        erc721Data.userState[to].balance = newBalance;

        // calculate incentives
        IRewardController rewardControllerLocal = erc721Data.rewardController;
        if (address(rewardControllerLocal) != address(0)) {
            rewardControllerLocal.handleAction(
                to,
                oldTotalSupply,
                vars.oldBalance
            );
        }

        return (vars.oldCollateralizedBalance, newCollateralizedBalance);
    }

    function executeBurnMultiple(
        MintableERC721Data storage erc721Data,
        IPool POOL,
        bool,
        address user,
        uint256[] calldata tokenIds
    ) external returns (uint64, uint64) {
        LocalVars memory vars = _cache(erc721Data, user);
        uint256 oldTotalSupply = erc721Data.allTokens.length;

        for (uint256 index = 0; index < tokenIds.length; index++) {
            uint256 tokenId = tokenIds[index];
            address owner = erc721Data.owners[tokenId];
            require(owner == user, "not the owner of Ntoken");
            require(
                !isAuctioned(erc721Data, POOL, tokenId),
                Errors.TOKEN_IN_AUCTION
            );

            _removeTokenFromAllTokensEnumeration(
                erc721Data,
                tokenId,
                oldTotalSupply - index
            );
            _removeTokenFromOwnerEnumeration(
                erc721Data,
                user,
                tokenId,
                vars.oldBalance - index
            );

            // Clear approvals
            _approve(erc721Data, address(0), tokenId);

            if (erc721Data.auctions[tokenId].startTime > 0) {
                delete erc721Data.auctions[tokenId];
            }

            if (erc721Data.isUsedAsCollateral[tokenId]) {
                delete erc721Data.isUsedAsCollateral[tokenId];
                vars.collateralizedTokens += 1;
                uint256 multiplier = getTraitMultiplier(erc721Data, tokenId);
                _executeUpdateTraitMultiplier(
                    erc721Data,
                    tokenId,
                    -multiplier.toInt256(),
                    -int64(1)
                );
            }

            delete erc721Data.owners[tokenId];

            emit Transfer(owner, address(0), tokenId);
        }

        erc721Data.userState[user].balance =
            vars.oldBalance -
            uint64(tokenIds.length);

        uint64 newCollateralizedBalance = vars.oldCollateralizedBalance -
            vars.collateralizedTokens;
        erc721Data
            .userState[user]
            .collateralizedBalance = newCollateralizedBalance;

        // calculate incentives
        IRewardController rewardControllerLocal = erc721Data.rewardController;

        if (address(rewardControllerLocal) != address(0)) {
            rewardControllerLocal.handleAction(
                user,
                oldTotalSupply,
                vars.oldBalance
            );
        }

        return (vars.oldCollateralizedBalance, newCollateralizedBalance);
    }

    function executeApprove(
        MintableERC721Data storage erc721Data,
        address to,
        uint256 tokenId
    ) external {
        _approve(erc721Data, to, tokenId);
    }

    function _approve(
        MintableERC721Data storage erc721Data,
        address to,
        uint256 tokenId
    ) private {
        erc721Data.tokenApprovals[tokenId] = to;
        emit Approval(erc721Data.owners[tokenId], to, tokenId);
    }

    function executeApprovalForAll(
        MintableERC721Data storage erc721Data,
        address owner,
        address operator,
        bool approved
    ) external {
        require(owner != operator, "ERC721: approve to caller");
        erc721Data.operatorApprovals[owner][operator] = approved;
        emit ApprovalForAll(owner, operator, approved);
    }

    function executeStartAuction(
        MintableERC721Data storage erc721Data,
        IPool POOL,
        uint256 tokenId
    ) external {
        require(
            !isAuctioned(erc721Data, POOL, tokenId),
            Errors.AUCTION_ALREADY_STARTED
        );
        require(
            _exists(erc721Data, tokenId),
            "ERC721: startAuction for nonexistent token"
        );
        erc721Data.auctions[tokenId] = DataTypes.Auction({
            startTime: block.timestamp
        });
    }

    function executeEndAuction(
        MintableERC721Data storage erc721Data,
        IPool POOL,
        uint256 tokenId
    ) external {
        require(
            isAuctioned(erc721Data, POOL, tokenId),
            Errors.AUCTION_NOT_STARTED
        );
        require(
            _exists(erc721Data, tokenId),
            "ERC721: endAuction for nonexistent token"
        );
        delete erc721Data.auctions[tokenId];
    }

    function _executeUpdateTraitMultiplier(
        MintableERC721Data storage erc721Data,
        uint256 tokenId,
        int256 multiplierDelta,
        int64 collateralizedBalanceDelta
    ) internal {
        address owner = erc721Data.owners[tokenId];
        if (owner == address(0)) {
            return;
        }

        uint256 collateralizedBalance = uint256(
            erc721Data.userState[owner].collateralizedBalance
        );
        uint256 avgMultiplier = erc721Data.userState[owner].avgMultiplier;

        int256 numerator = (avgMultiplier * collateralizedBalance).toInt256() +
            multiplierDelta;
        int256 denominator = collateralizedBalance.toInt256() +
            collateralizedBalanceDelta;

        uint256 newAvgMultiplier = denominator != 0
            ? uint256(numerator / denominator)
            : 0;
        erc721Data.userState[owner].avgMultiplier = newAvgMultiplier;
    }

    function executeSetTraitsMultipliers(
        MintableERC721Data storage erc721Data,
        uint256[] calldata tokenIds,
        uint256[] calldata multipliers
    ) external {
        require(
            tokenIds.length == multipliers.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        for (uint256 i = 0; i < tokenIds.length; i++) {
            _checkTraitMultiplier(multipliers[i]);
            uint256 oldMultiplier = erc721Data.traitsMultipliers[tokenIds[i]];
            erc721Data.traitsMultipliers[tokenIds[i]] = multipliers[i];
            address owner = erc721Data.owners[tokenIds[i]];
            if (owner == address(0)) {
                continue;
            }

            int256 multiplierDelta = multipliers[i].toInt256() -
                oldMultiplier.toInt256();
            _executeUpdateTraitMultiplier(
                erc721Data,
                tokenIds[i],
                multiplierDelta,
                0
            );
        }
    }

    function _checkBalanceLimit(
        MintableERC721Data storage erc721Data,
        bool atomic_pricing,
        uint64 balance
    ) private view {
        if (!atomic_pricing) return;
        uint64 balanceLimit = erc721Data.balanceLimit;
        require(
            balanceLimit == 0 || balance <= balanceLimit,
            Errors.NTOKEN_BALANCE_EXCEEDED
        );
    }

    function _checkTraitMultiplier(uint256 multiplier) private pure {
        require(
            multiplier >= MIN_TRAIT_MULTIPLIER &&
                multiplier < MAX_TRAIT_MULTIPLIER,
            Errors.INVALID_AMOUNT
        );
    }

    function _exists(MintableERC721Data storage erc721Data, uint256 tokenId)
        private
        view
        returns (bool)
    {
        return erc721Data.owners[tokenId] != address(0);
    }

    function _cache(MintableERC721Data storage erc721Data, address user)
        private
        view
        returns (LocalVars memory vars)
    {
        vars.oldBalance = erc721Data.userState[user].balance;
        vars.oldCollateralizedBalance = erc721Data
            .userState[user]
            .collateralizedBalance;
    }

    function getTraitMultiplier(
        MintableERC721Data storage erc721Data,
        uint256 tokenId
    ) internal view returns (uint256) {
        uint256 multiplier = erc721Data.traitsMultipliers[tokenId];
        return
            !Helpers.isTraitMultiplierEffective(multiplier)
                ? WadRayMath.WAD
                : multiplier;
    }

    function isAuctioned(
        MintableERC721Data storage erc721Data,
        IPool POOL,
        uint256 tokenId
    ) public view returns (bool) {
        return
            erc721Data.auctions[tokenId].startTime >
            POOL
                .getUserConfiguration(erc721Data.owners[tokenId])
                .auctionValidityTime;
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
        MintableERC721Data storage erc721Data,
        address from,
        address to,
        uint256 tokenId
    ) private {
        if (from == address(0)) {
            uint256 length = erc721Data.allTokens.length;
            _addTokenToAllTokensEnumeration(erc721Data, tokenId, length);
        } else if (from != to) {
            _removeTokenFromOwnerEnumeration(
                erc721Data,
                from,
                tokenId,
                erc721Data.userState[from].balance
            );
        }
        if (to == address(0)) {
            uint256 length = erc721Data.allTokens.length;
            _removeTokenFromAllTokensEnumeration(erc721Data, tokenId, length);
        } else if (to != from) {
            _addTokenToOwnerEnumeration(
                erc721Data,
                to,
                tokenId,
                erc721Data.userState[to].balance
            );
        }
    }

    /**
     * @dev Private function to add a token to this extension's ownership-tracking data structures.
     * @param to address representing the new owner of the given token ID
     * @param tokenId uint256 ID of the token to be added to the tokens list of the given address
     */
    function _addTokenToOwnerEnumeration(
        MintableERC721Data storage erc721Data,
        address to,
        uint256 tokenId,
        uint256 length
    ) private {
        erc721Data.ownedTokens[to][length] = tokenId;
        erc721Data.ownedTokensIndex[tokenId] = length;
    }

    /**
     * @dev Private function to add a token to this extension's token tracking data structures.
     * @param tokenId uint256 ID of the token to be added to the tokens list
     */
    function _addTokenToAllTokensEnumeration(
        MintableERC721Data storage erc721Data,
        uint256 tokenId,
        uint256 length
    ) private {
        erc721Data.allTokensIndex[tokenId] = length;
        erc721Data.allTokens.push(tokenId);
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
        MintableERC721Data storage erc721Data,
        address from,
        uint256 tokenId,
        uint256 userBalance
    ) private {
        uint256 lastTokenIndex = userBalance - 1;
        uint256 tokenIndex = erc721Data.ownedTokensIndex[tokenId];

        // When the token to delete is the last token, the swap operation is unnecessary
        if (tokenIndex != lastTokenIndex) {
            uint256 lastTokenId = erc721Data.ownedTokens[from][lastTokenIndex];

            erc721Data.ownedTokens[from][tokenIndex] = lastTokenId; // Move the last token to the slot of the to-delete token
            erc721Data.ownedTokensIndex[lastTokenId] = tokenIndex; // Update the moved token's index
        }

        // This also deletes the contents at the last position of the array
        delete erc721Data.ownedTokensIndex[tokenId];
        delete erc721Data.ownedTokens[from][lastTokenIndex];
    }

    /**
     * @dev Private function to remove a token from this extension's token tracking data structures.
     * This has O(1) time complexity, but alters the order of the _allTokens array.
     * @param tokenId uint256 ID of the token to be removed from the tokens list
     */
    function _removeTokenFromAllTokensEnumeration(
        MintableERC721Data storage erc721Data,
        uint256 tokenId,
        uint256 length
    ) private {
        // To prevent a gap in the tokens array, we store the last token in the index of the token to delete, and
        // then delete the last slot (swap and pop).

        uint256 lastTokenIndex = length - 1;
        uint256 tokenIndex = erc721Data.allTokensIndex[tokenId];

        // When the token to delete is the last token, the swap operation is unnecessary. However, since this occurs so
        // rarely (when the last minted token is burnt) that we still do the swap here to avoid the gas cost of adding
        // an 'if' statement (like in _removeTokenFromOwnerEnumeration)
        uint256 lastTokenId = erc721Data.allTokens[lastTokenIndex];

        erc721Data.allTokens[tokenIndex] = lastTokenId; // Move the last token to the slot of the to-delete token
        erc721Data.allTokensIndex[lastTokenId] = tokenIndex; // Update the moved token's index

        // This also deletes the contents at the last position of the array
        delete erc721Data.allTokensIndex[tokenId];
        erc721Data.allTokens.pop();
    }
}
