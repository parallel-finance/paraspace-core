// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "../dependencies/yoga-labs/ApeCoinStaking.sol";
import "./IParaApeStaking.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

/**
 * @title IPoolApeStaking
 *
 * @notice Defines the basic interface for an ParaSpace Ape Staking Pool.
 **/
interface IPoolApeStaking {
    /**
     * @notice return ParaApeStaking contract address
     */
    function paraApeStaking() external view returns (address);

    /**
     * @notice Borrow cApe from lending pool, only ParaApeStaking contract can call this function
     * @param amount Borrow amount of cApe from lending pool
     */
    function borrowPoolCApe(uint256 amount) external returns (uint256);

    /**
     * @notice Borrow ApeCoin/cApe from lending pool and stake ape in ParaApeStaking apecoin pool
     * @param apeCoinDepositInfo Detail deposit info of the apecoin pool
     * @param pairDepositInfo Detail deposit info of the apecoin pair pool
     * @param asset address of deposit asset, can be ApeCoin or cApe
     * @param cashAmount deposit amount from user wallet
     * @param borrowAmount Borrow amount of ApeCoin/cApe from lending pool
     * @dev Need check User health factor > 1.
     */
    function borrowAndStakingApeCoin(
        IParaApeStaking.ApeCoinDepositInfo[] calldata apeCoinDepositInfo,
        IParaApeStaking.ApeCoinPairDepositInfo[] calldata pairDepositInfo,
        address asset,
        uint256 cashAmount,
        uint256 borrowAmount,
        bool openSApeCollateralFlag
    ) external;

    /**
     * @notice calculate TimeLock parameters for the specified asset, only ParaApeStaking contract can call this function
     */
    function calculateTimeLockParams(
        address asset,
        uint256 amount
    ) external returns (DataTypes.TimeLockParams memory);

    struct UnstakingInfo {
        address nftAsset;
        ApeCoinStaking.SingleNft[] _nfts;
        ApeCoinStaking.PairNftWithdrawWithAmount[] _nftPairs;
    }

    struct ParaStakingInfo {
        //Para Ape Staking Pool Id
        uint256 PoolId;
        //Ape token ids
        uint32[] apeTokenIds;
        //BAKC token ids
        uint32[] bakcTokenIds;
    }

    struct ApeCoinInfo {
        address asset;
        uint256 totalAmount;
        uint256 borrowAmount;
        bool openSApeCollateralFlag;
    }

    function apeStakingMigration(
        UnstakingInfo[] calldata unstakingInfos,
        ParaStakingInfo[] calldata stakingInfos,
        ApeCoinInfo calldata apeCoinInfo
    ) external;

    /**
     * @notice Withdraw staked ApeCoin from the BAYC/MAYC pool
     * @param nftAsset Contract address of BAYC/MAYC
     * @param _nfts Array of BAYC/MAYC NFT's with staked amounts
     * @dev Need check User health factor > 1.
     */
    function withdrawApeCoin(
        address nftAsset,
        ApeCoinStaking.SingleNft[] calldata _nfts
    ) external;

    /**
     * @notice Claim rewards for array of tokenIds from the BAYC/MAYC pool
     * @param nftAsset Contract address of BAYC/MAYC
     * @param _nfts Array of NFTs owned and committed by the msg.sender
     * @dev Need check User health factor > 1.
     */
    function claimApeCoin(address nftAsset, uint256[] calldata _nfts) external;

    /**
     * @notice Withdraw staked ApeCoin from the BAKC pool
     * @param nftAsset Contract address of BAYC/MAYC
     * @param _nftPairs Array of Paired BAYC/MAYC NFT's with staked amounts
     * @dev Need check User health factor > 1.
     */
    function withdrawBAKC(
        address nftAsset,
        ApeCoinStaking.PairNftWithdrawWithAmount[] memory _nftPairs
    ) external;

    /**
     * @notice Claim rewards for array of tokenIds from the BAYC/MAYC pool
     * @param nftAsset Contract address of BAYC/MAYC
     * @param _nftPairs Array of Paired BAYC/MAYC NFT's
     * @dev Need check User health factor > 1.
     */
    function claimBAKC(
        address nftAsset,
        ApeCoinStaking.PairNft[] calldata _nftPairs
    ) external;

    /**
     * @notice Unstake user Ape coin staking position and repay user debt
     * @param nftAsset Contract address of BAYC/MAYC
     * @param tokenId Token id of the ape staking position on
     * @dev Need check User health factor > 1.
     */
    function unstakeApePositionAndRepay(
        address nftAsset,
        uint256 tokenId
    ) external;

    /**
     * @notice repay asset and supply asset for user
     * @param underlyingAsset Contract address of BAYC/MAYC
     * @param onBehalfOf The beneficiary of the repay and supply
     * @dev Convenient callback function for unstakeApePositionAndRepay. Only NToken of BAYC/MAYC can call this.
     */
    function repayAndSupply(
        address underlyingAsset,
        address onBehalfOf,
        uint256 totalAmount
    ) external;
}
