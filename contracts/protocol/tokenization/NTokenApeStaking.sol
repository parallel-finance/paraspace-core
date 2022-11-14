// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {NToken} from "./NToken.sol";
import {ApeCoinStaking} from "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {SafeCast} from "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";
import {SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";

/**
 * @title ApeCoinStaking NToken
 *
 * @notice Implementation of the NToken for the ParaSpace protocol
 */
abstract contract NTokenApeStaking is NToken {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;

    ApeCoinStaking immutable _apeCoinStaking;

    uint256 constant BAYC_POOL_ID = 1;
    uint256 constant MAYC_POOL_ID = 2;
    uint256 constant BAKC_POOL_ID = 3;
    uint256 constant APE_COIN_PRECISION = 1e18;

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
        uint256 totalAmount = 0;

        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                ownerOf(_nftPairs[index].mainTokenId) == msg.sender,
                "NToken: not owner of token"
            );
            totalAmount += _nftPairs[index].amount;

            IERC721 bakcContract = IERC721(
                _apeCoinStaking.nftContracts(BAKC_POOL_ID)
            );
            if (
                bakcContract.ownerOf(_nftPairs[index].bakcTokenId) !=
                address(this)
            ) {
                bakcContract.safeTransferFrom(
                    msg.sender,
                    address(this),
                    _nftPairs[index].bakcTokenId
                );
            }
        }

        _apeCoinStaking.apeCoin().transferFrom(
            msg.sender,
            address(this),
            totalAmount
        );

        ApeCoinStaking.PairNftWithAmount[]
            memory _otherPairs = new ApeCoinStaking.PairNftWithAmount[](0);

        if (POOL_ID() == BAYC_POOL_ID) {
            _apeCoinStaking.depositBAKC(_nftPairs, _otherPairs);
        } else {
            _apeCoinStaking.depositBAKC(_otherPairs, _nftPairs);
        }
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
     * @notice Claim rewards for array of Paired NFTs and send to recipient
     * @param _nftPairs Array of Paired BAYC/MAYC NFTs owned and committed by the msg.sender
     * @param _recipient Address to send claim reward to
     */
    function claimBAKC(
        ApeCoinStaking.PairNft[] calldata _nftPairs,
        address _recipient
    ) external nonReentrant {
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                ownerOf(_nftPairs[index].mainTokenId) == msg.sender,
                "NToken: not owner of token"
            );
        }
        ApeCoinStaking.PairNft[]
            memory _otherPairs = new ApeCoinStaking.PairNft[](0);

        if (POOL_ID() == BAYC_POOL_ID) {
            _apeCoinStaking.claimBAKC(_nftPairs, _otherPairs, _recipient);
        } else {
            _apeCoinStaking.claimBAKC(_otherPairs, _nftPairs, _recipient);
        }
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
     * @notice Withdraw staked ApeCoin from the Pair pool.  If withdraw is total staked amount, performs an automatic claim.
     * @param _nftPairs Array of Paired BAYC/MAYC NFT's with staked amounts
     * @dev if pairs have split ownership and BAKC is attempting a withdraw, the withdraw must be for the total staked amount
     */
    function withdrawBAKC(
        ApeCoinStaking.PairNftWithAmount[] memory _nftPairs,
        address _apeRecipient,
        address _bakcRecipient
    ) external nonReentrant {
        _withdrawBAKC(_nftPairs, true, _apeRecipient, _bakcRecipient);
    }

    function _withdrawBAKC(
        ApeCoinStaking.PairNftWithAmount[] memory _nftPairs,
        bool validate,
        address _apeRecipient,
        address _bakcRecipient
    ) internal {
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            if (validate) {
                require(
                    ownerOf(_nftPairs[index].mainTokenId) == msg.sender,
                    "NToken: not owner of token"
                );
            }

            (uint256 stakedAmount, ) = _apeCoinStaking.nftPosition(
                BAKC_POOL_ID,
                _nftPairs[index].bakcTokenId
            );

            if (
                _nftPairs[index].amount == 0 ||
                _nftPairs[index].amount == stakedAmount
            ) {
                _nftPairs[index].amount = stakedAmount;

                IERC721(_apeCoinStaking.nftContracts(BAKC_POOL_ID))
                    .transferFrom(
                        address(this),
                        _bakcRecipient,
                        _nftPairs[index].bakcTokenId
                    );
            }
        }

        uint256 balanceBefore = _apeCoinStaking.apeCoin().balanceOf(
            address(this)
        );

        ApeCoinStaking.PairNftWithAmount[]
            memory _otherPairs = new ApeCoinStaking.PairNftWithAmount[](0);

        if (POOL_ID() == BAYC_POOL_ID) {
            _apeCoinStaking.withdrawBAKC(_nftPairs, _otherPairs);
        } else {
            _apeCoinStaking.withdrawBAKC(_otherPairs, _nftPairs);
        }

        uint256 balanceAfter = _apeCoinStaking.apeCoin().balanceOf(
            address(this)
        );

        _apeCoinStaking.apeCoin().safeTransfer(
            _apeRecipient,
            balanceAfter - balanceBefore
        );
    }

    /**
     * @notice Overrides the transferOnLiquidation from NToken to withdraw all staked and pending rewards before transfer the asset on liquidation
     */
    function transferOnLiquidation(address from, address to, uint256 tokenId)
        external
        override
        onlyPool
        nonReentrant
    {
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
        ApeCoinStaking.PairNftWithAmount[]
            memory _bakcPairs = new ApeCoinStaking.PairNftWithAmount[](
                tokenIdLength
            );

        uint256 counter = 0;
        uint256 pairdBakcCounter = 0;

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

            (uint256 bakcTokenId, bool isPaired) = _apeCoinStaking.mainToBakc(
                POOL_ID(),
                tokenIds[index]
            );
            if (isPaired) {
                _bakcPairs[index] = ApeCoinStaking.PairNftWithAmount({
                    mainTokenId: tokenIds[index],
                    bakcTokenId: bakcTokenId,
                    amount: 0
                });
                pairdBakcCounter++;
            }
        }

        if (counter > 0) {
            assembly {
                mstore(nfts, counter)
            }
            _withdrawApeCoin(nfts, _recipient);
        }

        if (pairdBakcCounter > 0) {
            assembly {
                mstore(_bakcPairs, pairdBakcCounter)
            }
            _withdrawBAKC(_bakcPairs, false, _recipient, _recipient);
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
