// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {NToken} from "./NToken.sol";
import {ApeCoinStaking} from "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";

/**
 * @title ApeCoinStaking NToken
 *
 * @notice Implementation of the NToken for the ParaSpace protocol
 */
abstract contract NTokenApeStaking is NToken {
    ApeCoinStaking immutable _apeCoinStaking;

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
        _apeCoinStaking.apeCoin().approve(
            address(_apeCoinStaking),
            type(uint256).max
        );

        super.initialize(
            initializingPool,
            underlyingAsset,
            incentivesController,
            nTokenName,
            nTokenSymbol,
            params
        );
    }

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
        uint256 totalAmount = 0;

        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                ownerOf(_nfts[index].tokenId) == msg.sender,
                "NToken: not owner of token"
            );
            totalAmount += _nfts[index].amount;
        }

        _apeCoinStaking.apeCoin().transferFrom(
            msg.sender,
            address(this),
            totalAmount
        );

        _depositApeCoin(_nfts);
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
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                ownerOf(_nfts[index]) == msg.sender,
                "NToken: not owner of token"
            );
        }

        _claimApeCoin(_nfts, _recipient);
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
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                ownerOf(_nfts[index].tokenId) == msg.sender,
                "NToken: not owner of token"
            );
        }

        _withdrawApeCoin(_nfts, _recipient);
    }

    /**
     * @notice Overrides the transferOnLiquidation from NToken to withdraw all staked and pending rewards before transfer the asset on liquidation
     */
    function transferOnLiquidation(
        address from,
        address to,
        uint256 tokenId
    ) external override onlyPool nonReentrant {
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        _withdraw(tokenIds, from);

        _transfer(from, to, tokenId, false);
    }

    /**
     * @notice Overrides the burn from NToken to withdraw all staked and pending rewards before burning the NToken on liquidation/withdraw
     */
    function burn(
        address from,
        address receiverOfUnderlying,
        uint256[] calldata tokenIds
    ) external virtual override onlyPool nonReentrant returns (uint64, uint64) {
        _withdraw(tokenIds, from);

        return _burn(from, receiverOfUnderlying, tokenIds);
    }

    function _withdraw(uint256[] memory tokenIds, address _recipient) internal {
        uint256 tokenIdLength = tokenIds.length;

        ApeCoinStaking.SingleNft[] memory nfts = new ApeCoinStaking.SingleNft[](
            tokenIdLength
        );
        uint256 counter = 0;

        for (uint256 index = 0; index < tokenIdLength; index++) {
            (uint256 stakedAmount, ) = _apeCoinStaking.nftPosition(
                POOL_ID(),
                tokenIds[index]
            );

            if (stakedAmount > 0) {
                nfts[counter] = ApeCoinStaking.SingleNft({
                    tokenId: tokenIds[index],
                    amount: stakedAmount
                });
                counter++;
            }
        }

        if (counter > 0) {
            assembly {
                mstore(nfts, counter)
            }
            _withdrawApeCoin(nfts, _recipient);
        }
    }

    function _depositApeCoin(ApeCoinStaking.SingleNft[] calldata _nfts)
        internal
        virtual
    {
        // should be overridden
    }

    function _claimApeCoin(uint256[] calldata _nfts, address _recipient)
        internal
        virtual
    {
        // should be overridden
    }

    function _withdrawApeCoin(
        ApeCoinStaking.SingleNft[] memory _nfts,
        address _recipient
    ) internal virtual {
        // should be overridden
    }

    function POOL_ID() internal virtual returns (uint256) {
        // should be overridden
        return 0;
    }
}
