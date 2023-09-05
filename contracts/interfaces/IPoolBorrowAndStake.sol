// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "../dependencies/yoga-labs/ApeCoinStaking.sol";

/**
 * @title IPoolBorrowAndStake
 *
 * @notice Defines the basic interface for an ParaSpace Ape Staking Pool.
 **/
interface IPoolBorrowAndStake {
    struct StakingInfoV2 {
        // Contract address of BAYC/MAYC
        address nftAsset;
        // address of borrowing asset, can be Ape or cApe
        address borrowAsset;
        // Borrow amount of Ape from lending pool
        uint256 borrowAmount;
        address cashAsset;
        // Cash amount of Ape from user wallet
        uint256 cashAmount;
    }

    /**
     * @notice Deposit ape coin to BAYC/MAYC pool or BAKC pool
     * @param stakingInfo Detail info of the staking
     * @param _nfts Array of BAYC/MAYC NFT's with staked amounts
     * @param _nftPairs Array of Paired BAYC/MAYC NFT's with staked amounts
     * @dev Need check User health factor > 1.
     */
    function borrowApeAndStakeV2(
        StakingInfoV2 calldata stakingInfo,
        ApeCoinStaking.SingleNft[] calldata _nfts,
        ApeCoinStaking.PairNftDepositWithAmount[] calldata _nftPairs
    ) external;
}
