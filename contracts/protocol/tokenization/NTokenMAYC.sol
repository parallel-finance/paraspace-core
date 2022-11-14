// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {ApeCoinStaking} from "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {NTokenApeStaking} from "./NTokenApeStaking.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";
import {ApeStakingLogic} from "./libraries/ApeStakingLogic.sol";

/**
 * @title MAYC NToken
 *
 * @notice Implementation of the NToken for the ParaSpace protocol
 */
contract NTokenMAYC is NTokenApeStaking {
    constructor(IPool pool, address apeCoinStaking)
        NTokenApeStaking(pool, apeCoinStaking)
    {}

    /**
     * @notice Deposit ApeCoin to the BAYC Pool
     * @param _nfts Array of SingleNft structs
     * @dev Commits 1 or more BAYC NFTs, each with an ApeCoin amount to the BAYC pool.\
     * Each BAYC committed must attach an ApeCoin amount >= 1 ApeCoin and <= the BAYC pool cap amount.
     */
    function depositApeCoin(ApeCoinStaking.SingleNft[] calldata _nfts)
        external
        nonReentrant
    {
        ApeStakingLogic.executeDepositMAYC(_owners, _apeCoinStaking, _nfts);
    }

    /**
     * @notice Claim rewards for array of BAYC NFTs and send to recipient
     * @param _nfts Array of NFTs owned and committed by the msg.sender
     * @param _recipient Address to send claim reward to
     */
    function claimApeCoin(uint256[] calldata _nfts, address _recipient)
        external
        nonReentrant
    {
        ApeStakingLogic.executeClaimMAYC(
            _owners,
            _apeCoinStaking,
            _nfts,
            _recipient
        );
    }

    /**
     * @notice Withdraw staked ApeCoin from the BAYC pool.  If withdraw is total staked amount, performs an automatic claim.
     * @param _nfts Array of BAYC NFT's with staked amounts
     * @param _recipient Address to send withdraw amount and claim to
     */
    function withdrawApeCoin(
        ApeCoinStaking.SingleNft[] calldata _nfts,
        address _recipient
    ) external nonReentrant {
        ApeStakingLogic.executeWithdrawMAYC(
            _owners,
            _apeCoinStaking,
            _nfts,
            _recipient
        );
    }

    /**
     * @notice Deposit ApeCoin to the Pair Pool, where Pair = (BAYC + BAKC) or (MAYC + BAKC)
     * @param _nftPairs Array of PairNftWithAmount structs
     * @dev Commits 1 or more Pairs, each with an ApeCoin amount to the Pair pool.\
     * Each BAKC committed must attach an ApeCoin amount >= 1 ApeCoin and <= the Pair pool cap amount.\
     * Example 1: BAYC + BAKC + 1 ApeCoin:  [[0, 0, "1000000000000000000"],[]]\
     * Example 2: MAYC + BAKC + 1 ApeCoin:  [[], [0, 0, "1000000000000000000"]]\
     * Example 3: (BAYC + BAKC + 1 ApeCoin) and (MAYC + BAKC + 1 ApeCoin): [[0, 0, "1000000000000000000"], [0, 1, "1000000000000000000"]]
     */
    function depositBAKC(ApeCoinStaking.PairNftWithAmount[] calldata _nftPairs)
        external
        nonReentrant
    {
        ApeStakingLogic.executeDepositBAKCWithMAYC(
            _owners,
            _apeCoinStaking,
            _nftPairs
        );
    }

    /**
     * @notice Claim rewards for array of Paired NFTs and send to recipient
     * @param _nftPairs Array of Paired BAYC/MAYC NFTs owned and committed by the msg.sender
     * @param _recipient Address to send claim reward to
     */
    function claimBAKC(
        ApeCoinStaking.PairNft[] calldata _nftPairs,
        address _recipient
    ) external nonReentrant {
        ApeStakingLogic.executeClaimBAKCWithMAYC(
            _owners,
            _apeCoinStaking,
            _nftPairs,
            _recipient
        );
    }

    /**
     * @notice Withdraw staked ApeCoin from the Pair pool.  If withdraw is total staked amount, performs an automatic claim.
     * @param _nftPairs Array of Paired BAYC/MAYC NFT's with staked amounts
     * @dev if pairs have split ownership and BAKC is attempting a withdraw, the withdraw must be for the total staked amount
     */
    function withdrawBAKC(
        ApeCoinStaking.PairNftWithAmount[] memory _nftPairs,
        address _apeRecipient,
        address _bakcRecipient
    ) external nonReentrant {
        ApeStakingLogic.executeWithdrawBAKCWithMAYC(
            _owners,
            _apeCoinStaking,
            _nftPairs,
            _apeRecipient,
            _bakcRecipient
        );
    }

    function POOL_ID() internal virtual override returns (uint256) {
        return MAYC_POOL_ID;
    }

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenMAYC;
    }
}
