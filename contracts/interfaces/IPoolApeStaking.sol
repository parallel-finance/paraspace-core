// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import "../dependencies/yoga-labs/ApeCoinStaking.sol";

/**
 * @title IPoolApeStaking
 *
 * @notice Defines the basic interface for an ParaSpace Ape Staking Pool.
 **/
interface IPoolApeStaking {
    struct StakingInfo {
        address nftAsset;
        uint256 borrowAmount;
        uint256 cashAmount;
    }

    function borrowApeAndStake(
        StakingInfo calldata stakingInfo,
        ApeCoinStaking.SingleNft[] calldata _nfts,
        ApeCoinStaking.PairNftWithAmount[] calldata _nftPairs
    ) external;

    function withdrawApeCoin(
        address nftAsset,
        ApeCoinStaking.SingleNft[] calldata _nfts
    ) external;

    function claimApeCoin(address nftAsset, uint256[] calldata _nfts) external;

    function withdrawBAKC(
        address nftAsset,
        ApeCoinStaking.PairNftWithAmount[] memory _nftPairs
    ) external;

    function claimBAKC(
        address nftAsset,
        ApeCoinStaking.PairNft[] calldata _nftPairs
    ) external;

    function unstakeApePositionAndRepay(address nftAsset, uint256 tokenId)
        external;

    function repayAndSupply(
        address underlyingAsset,
        address repayAsset,
        address onBehalfOf,
        uint256 repayAmount,
        uint256 supplyAmount
    ) external;
}
