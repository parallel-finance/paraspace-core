// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import {INToken} from "../interfaces/INToken.sol";
import "../dependencies/openzeppelin/contracts//IERC20.sol";
import "../dependencies/openzeppelin/contracts//IERC721.sol";
import "../dependencies/yoga-labs/ApeCoinStaking.sol";

contract ParaXApeCoinStakingVoting {
    ApeCoinStaking immutable apeCoinStaking;
    IERC20 immutable cApe;
    INToken immutable nBAYC;
    INToken immutable nMAYC;
    INToken immutable nBAKC;

    uint256 constant BAYC_POOL_ID = 1;
    uint256 constant MAYC_POOL_ID = 2;
    uint256 constant BAKC_POOL_ID = 3;

    constructor(
        address _cApe,
        address _apeCoinStaking,
        address _nBAYC,
        address _nMAYC,
        address _nBAKC
    ) {
        cApe = IERC20(_cApe);
        apeCoinStaking = ApeCoinStaking(_apeCoinStaking);
        nBAYC = INToken(_nBAYC);
        nMAYC = INToken(_nMAYC);
        nBAKC = INToken(_nBAKC);
    }

    /**
     * @notice Returns a vote count across all pools in the ApeCoinStaking contract for a given address
     * @param userAddress The address to return votes for
     */
    function getVotes(address userAddress) public view returns (uint256 votes) {
        votes = getCApeVotes(userAddress);
        votes += getVotesInAllNftPool(userAddress);
    }

    function getCApeVotes(
        address userAddress
    ) public view returns (uint256 votes) {
        votes = cApe.balanceOf(userAddress);
    }

    function getVotesInAllNftPool(
        address userAddress
    ) public view returns (uint256 votes) {
        votes = getVotesForNToken(nBAYC, BAYC_POOL_ID, userAddress);
        votes += getVotesForNToken(nMAYC, MAYC_POOL_ID, userAddress);
        votes += getVotesForNToken(nBAKC, BAKC_POOL_ID, userAddress);
    }

    function getVotesForNToken(
        INToken ntoken,
        uint256 poolId,
        address userAddress
    ) public view returns (uint256 votes) {
        uint256 balance = ntoken.balanceOf(userAddress);
        if (balance == 0) {
            return 0;
        }

        IERC721 underlyingNFT = IERC721(ntoken.UNDERLYING_ASSET_ADDRESS());
        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId = ntoken.tokenOfOwnerByIndex(userAddress, i);
            //ensure nToken owns the underlying asset(to exclude P2P case)
            if (underlyingNFT.ownerOf(tokenId) != address(ntoken)) {
                continue;
            }

            (uint256 stakedAmount, ) = apeCoinStaking.nftPosition(
                poolId,
                tokenId
            );
            uint256 pendingReward = apeCoinStaking.pendingRewards(
                poolId,
                address(ntoken),
                tokenId
            );
            votes += (pendingReward + stakedAmount);
        }
    }
}
