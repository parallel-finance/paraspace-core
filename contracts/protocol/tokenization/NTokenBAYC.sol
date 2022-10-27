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
contract NTokenBAYC is NToken {
    ApeCoinStaking immutable _apeCoinStaking;
    uint256 constant BAYC_POOL_ID = 1;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool, address apeCoinStaking) NToken(pool, false) {
        _apeCoinStaking = ApeCoinStaking(apeCoinStaking);
    }

    /**
     * @notice Deposit ApeCoin to the BAYC Pool
     * @param _nfts Array of SingleNft structs
     * @dev Commits 1 or more BAYC NFTs, each with an ApeCoin amount to the BAYC pool.\
     * Each BAYC committed must attach an ApeCoin amount >= 1 ApeCoin and <= the BAYC pool cap amount.
     */
    function depositBAYC(ApeCoinStaking.SingleNft[] calldata _nfts) external {
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(ownerOf(_nfts[index].tokenId) == msg.sender);

            _apeCoinStaking.apeCoin().transferFrom(
                msg.sender,
                address(this),
                _nfts[index].amount
            );
        }

        _apeCoinStaking.depositBAYC(_nfts);
    }

    /**
     * @notice Claim rewards for array of BAYC NFTs and send to recipient
     * @param _nfts Array of NFTs owned and committed by the msg.sender
     * @param _recipient Address to send claim reward to
     */
    function claimBAYC(uint256[] calldata _nfts, address _recipient) external {
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(ownerOf(_nfts[index]) == msg.sender);
        }

        _apeCoinStaking.claimBAYC(_nfts, _recipient);
    }

    /**
     * @notice Withdraw staked ApeCoin from the BAYC pool.  If withdraw is total staked amount, performs an automatic claim.
     * @param _nfts Array of BAYC NFT's with staked amounts
     * @param _recipient Address to send withdraw amount and claim to
     */
    function withdrawBAYC(
        ApeCoinStaking.SingleNft[] calldata _nfts,
        address _recipient
    ) external {
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(ownerOf(_nfts[index].tokenId) == msg.sender);
        }

        _apeCoinStaking.withdrawBAYC(_nfts, _recipient);
    }

    /**
     * @notice Overrides the transferOnLiquidation from NToken to withdraw all staked and pending rewards before trasnfer the asset on liquidation
     */
    function transferOnLiquidation(address from, address to, uint256 tokenId)
        public
        override
        onlyPool
        nonReentrant
    {
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        _withdrawBAYC(tokenIds, from);

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
        _withdrawBAYC(tokenIds, from);

        return super.burn(from, receiverOfUnderlying, tokenIds);
    }

    function _withdrawBAYC(uint256[] memory tokenIds, address _recipient)
        internal
    {
        ApeCoinStaking.SingleNft[] memory nfts = new ApeCoinStaking.SingleNft[](
            tokenIds.length
        );

        for (uint256 index = 0; index < tokenIds.length; index++) {
            (uint256 stakedAmount, ) = _apeCoinStaking.nftPosition(
                BAYC_POOL_ID,
                tokenIds[index]
            );

            uint256 totalAmount = stakedAmount +
                _apeCoinStaking.pendingRewards(
                    BAYC_POOL_ID,
                    address(this),
                    tokenIds[index]
                );

            nfts[index] = ApeCoinStaking.SingleNft({
                tokenId: tokenIds[index],
                amount: totalAmount
            });
        }

        _apeCoinStaking.withdrawBAYC(nfts, _recipient);
    }
}
