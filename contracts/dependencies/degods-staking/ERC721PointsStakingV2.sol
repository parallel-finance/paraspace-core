// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {ERC721PointsStakingV1} from "./ERC721PointsStakingV1.sol";
import {IERC5058Upgradeable} from "./libs/IERC5058Upgradeable.sol";

contract ERC721PointsStakingV2 is ERC721PointsStakingV1 {
    // Sets expired time to maximum uint256 value so that it's essentially never automatically expired.
    uint256 private constant MAX_EXPIRE_TIME =
    0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    function _stakeNft(uint256 tokenId) internal virtual override {
        // This special check is needed as otherwise a user would be able to stake an un-owned token whose owner has
        // previously approved staking contract for locking all its tokens.
        if (stakingToken.ownerOf(tokenId) != msg.sender) {
            revert NotTokenOwner();
        }
        IERC5058Upgradeable(address(stakingToken)).lock(tokenId, MAX_EXPIRE_TIME);
    }

    function _unstakeNft(uint256 tokenId) internal virtual override {
        if (stakingToken.ownerOf(tokenId) == address(this)) {
            // For custodial-staked tokens deposited before the non-custodial upgrade, transfer back the token to the owner.
            stakingToken.safeTransferFrom(address(this), msg.sender, tokenId);
        } else {
            // For non-custodial staked tokens, unlock the token.
            IERC5058Upgradeable(address(stakingToken)).unlock(tokenId);
        }
    }

    // @dev This empty reserved space is put in place to allow future versions to add new variables without shifting down
    // storage in the inheritance chain.
    // See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[50] private __gap;
}
