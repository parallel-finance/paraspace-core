// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {NToken} from "./NToken.sol";
import {ApeCoinStaking} from "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";


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

    function initialize(
        IPool initializingPool,
        address underlyingAsset,
        IRewardController incentivesController,
        string calldata nTokenName,
        string calldata nTokenSymbol,
        bytes calldata params
    ) public virtual override initializer {
        _apeCoinStaking.apeCoin().approve(address(_apeCoinStaking), type(uint256).max);
        
        super.initialize(initializingPool, underlyingAsset, incentivesController, nTokenName, nTokenSymbol, params);
    }

    /**
     * @notice Deposit ApeCoin to the BAYC Pool
     * @param _nfts Array of SingleNft structs
     * @dev Commits 1 or more BAYC NFTs, each with an ApeCoin amount to the BAYC pool.\
     * Each BAYC committed must attach an ApeCoin amount >= 1 ApeCoin and <= the BAYC pool cap amount.
     */
    function depositBAYC(ApeCoinStaking.SingleNft[] calldata _nfts) external {
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(ownerOf(_nfts[index].tokenId) == msg.sender, "NToken: not owner of token");

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
            require(ownerOf(_nfts[index]) == msg.sender, "NToken: not owner of token");
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
     * @notice Overrides the transferOnLiquidation from NToken to withdraw all staked and pending rewards before transfer the asset on liquidation
     */
    function transferOnLiquidation(address from, address to, uint256 tokenId)
        public
        override
        onlyPool
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
    ) public virtual override onlyPool returns (bool) {
        _withdrawBAYC(tokenIds, from);

        return super.burn(from, receiverOfUnderlying, tokenIds);
    }

    function _withdrawBAYC(uint256[] memory tokenIds, address _recipient)
        internal
    {   
        uint256 tokenIdLength = tokenIds.length;

        ApeCoinStaking.SingleNft[] memory nfts = new ApeCoinStaking.SingleNft[](
            tokenIdLength
        );
        uint256 counter = 0;

        for (uint256 index = 0; index < tokenIdLength; index++) {

            (uint256 stakedAmount, ) = _apeCoinStaking.nftPosition(
                BAYC_POOL_ID,
                tokenIds[index]
            );

            if (stakedAmount > 0) {
                uint256 pendingRewards =  _apeCoinStaking.pendingRewards(
                        BAYC_POOL_ID,
                        address(this),
                        tokenIds[index]
                    );
                uint256 totalAmount = stakedAmount + pendingRewards;

                nfts[counter] = ApeCoinStaking.SingleNft({
                    tokenId: tokenIds[index],
                    amount: totalAmount
                });
                counter++;
            }
        }

        if (counter > 0) {
            assembly { mstore(nfts, sub(mload(nfts), sub(tokenIdLength, counter))) }
            _apeCoinStaking.withdrawBAYC(nfts, _recipient);
        }
        
    }
}
