// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {NToken} from "./NToken.sol";
import {ApeCoinStaking} from "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";

/**
 * @title BAYC NToken
 *
 * @notice Implementation of the NToken for the ParaSpace protocol
 */
contract NTokenMAYC is NToken {
    ApeCoinStaking immutable _apeCoinStaking;
    uint256 constant MAYC_POOL_ID = 2;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool, address apeCoinStaking) NToken(pool, false) {
        _apeCoinStaking = ApeCoinStaking(apeCoinStaking);
        _apeCoinStaking.apeCoin().approve(address(_apeCoinStaking), type(uint256).max);
    }

    /**
     * @notice Deposit ApeCoin to the MAYC Pool
     * @param _nfts Array of SingleNft structs
     * @dev Commits 1 or more MAYC NFTs, each with an ApeCoin amount to the MAYC pool.\
     * Each MAYC committed must attach an ApeCoin amount >= 1 ApeCoin and <= the MAYC pool cap amount.
     */
    function depositMAYC(ApeCoinStaking.SingleNft[] calldata _nfts) external {
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(ownerOf(_nfts[index].tokenId) == msg.sender);

            _apeCoinStaking.apeCoin().transferFrom(
                msg.sender,
                address(this),
                _nfts[index].amount
            );
        }

        _apeCoinStaking.depositMAYC(_nfts);
    }

    /**
     * @notice Claim rewards for array of MAYC NFTs and send to recipient
     * @param _nfts Array of NFTs owned and committed by the msg.sender
     * @param _recipient Address to send claim reward to
     */
    function claimMAYC(uint256[] calldata _nfts, address _recipient) external {
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(ownerOf(_nfts[index]) == msg.sender);
        }

        _apeCoinStaking.claimMAYC(_nfts, _recipient);
    }

    /**
     * @notice Withdraw staked ApeCoin from the MAYC pool.  If withdraw is total staked amount, performs an automatic claim.
     * @param _nfts Array of MAYC NFT's with staked amounts
     * @param _recipient Address to send withdraw amount and claim to
     */
    function withdrawMAYC(
        ApeCoinStaking.SingleNft[] calldata _nfts,
        address _recipient
    ) external {
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(ownerOf(_nfts[index].tokenId) == msg.sender);
        }

        _apeCoinStaking.withdrawMAYC(_nfts, _recipient);
    }

    /**
     * @notice Overrides the transferOnLiquidation from NToken to withdraw all staked and pending rewards before transfer the asset on liquidation
     */
    function transferOnLiquidation(address from, address to, uint256 tokenId)
        public
        override
        onlyPool
        nonReentrant
    {
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        _withdrawMAYC(tokenIds, from);

        super.transferOnLiquidation(from, to, tokenId);
    }

    /**
     * @notice Overrides the burn from NToken to withdraw all staked and pending rewards before burning the NToken on liquidation/withdraw
     */

    function burn(
        address from,
        address receiverOfUnderlying,
        uint256[] calldata tokenIds
    ) public virtual override onlyPool nonReentrant returns (bool) {
        _withdrawMAYC(tokenIds, from);

        return super.burn(from, receiverOfUnderlying, tokenIds);
    }

    function _withdrawMAYC(uint256[] memory tokenIds, address _recipient)
        internal
    {   
        uint256 tokenIdLength = tokenIds.length;

        ApeCoinStaking.SingleNft[] memory nfts = new ApeCoinStaking.SingleNft[](
            tokenIdLength
        );
        uint256 counter = 0;

        for (uint256 index = 0; index < tokenIdLength; index++) {
            (uint256 stakedAmount, ) = _apeCoinStaking.nftPosition(
                MAYC_POOL_ID,
                tokenIds[index]
            );

            uint256 totalAmount = stakedAmount +
                _apeCoinStaking.pendingRewards(
                    MAYC_POOL_ID,
                    address(this),
                    tokenIds[index]
                );

            if (totalAmount > 0) {
                nfts[counter] = ApeCoinStaking.SingleNft({
                    tokenId: tokenIds[index],
                    amount: totalAmount
                });
                counter++;
            }
        }

        assembly { mstore(nfts, sub(mload(nfts), sub(tokenIdLength, counter))) }

        if (nfts.length > 0) {
            _apeCoinStaking.withdrawMAYC(nfts, _recipient);
        }
        
    }
}
