// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;
import {ApeCoinStaking} from "../../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {IERC721} from "../../../dependencies/openzeppelin/contracts/IERC721.sol";
import {SafeERC20} from "../../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";

/**
 * @title ApeStakingLogic library
 *
 * @notice Implements the base logic for ApeStaking
 */
library ApeStakingLogic {
    using SafeERC20 for IERC20;

    uint256 constant BAYC_POOL_ID = 1;
    uint256 constant MAYC_POOL_ID = 2;
    uint256 constant BAKC_POOL_ID = 3;

    /**
     * @notice Deposit ApeCoin to the BAYC Pool
     * @param _nfts Array of SingleNft structs
     * @dev Commits 1 or more BAYC NFTs, each with an ApeCoin amount to the BAYC pool.\
     * Each BAYC committed must attach an ApeCoin amount >= 1 ApeCoin and <= the BAYC pool cap amount.
     */
    function executeDepositBAYC(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.SingleNft[] calldata _nfts
    ) external {
        _validateAndDepositApeCoin(_owners, _apeCoinStaking, _nfts);

        _apeCoinStaking.depositBAYC(_nfts);
    }

    /**
     * @notice Deposit ApeCoin to the MAYC Pool
     * @param _nfts Array of SingleNft structs
     * @dev Commits 1 or more MAYC NFTs, each with an ApeCoin amount to the MAYC pool.\
     * Each MAYC committed must attach an ApeCoin amount >= 1 ApeCoin and <= the MAYC pool cap amount.
     */
    function executeDepositMAYC(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.SingleNft[] calldata _nfts
    ) external {
        _validateAndDepositApeCoin(_owners, _apeCoinStaking, _nfts);

        _apeCoinStaking.depositMAYC(_nfts);
    }

    function _validateAndDepositApeCoin(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.SingleNft[] calldata _nfts
    ) internal {
        uint256 totalAmount = 0;

        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                _owners[_nfts[index].tokenId] == msg.sender,
                "NToken: not owner of token"
            );
            totalAmount += _nfts[index].amount;
        }

        _apeCoinStaking.apeCoin().transferFrom(
            msg.sender,
            address(this),
            totalAmount
        );
    }

    /**
     * @notice Claim rewards for array of BAYC NFTs and send to recipient
     * @param _nfts Array of NFTs owned and committed by the msg.sender
     * @param _recipient Address to send claim reward to
     */
    function executeClaimBAYC(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        uint256[] calldata _nfts,
        address _recipient
    ) external {
        _validateClaimApeCoin(_owners, _nfts);

        _apeCoinStaking.claimBAYC(_nfts, _recipient);
    }

    /**
     * @notice Claim rewards for array of MAYC NFTs and send to recipient
     * @param _nfts Array of NFTs owned and committed by the msg.sender
     * @param _recipient Address to send claim reward to
     */
    function executeClaimMAYC(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        uint256[] calldata _nfts,
        address _recipient
    ) external {
        _validateClaimApeCoin(_owners, _nfts);

        _apeCoinStaking.claimMAYC(_nfts, _recipient);
    }

    function _validateClaimApeCoin(
        mapping(uint256 => address) storage _owners,
        uint256[] calldata _nfts
    ) internal view {
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                _owners[_nfts[index]] == msg.sender,
                "NToken: not owner of token"
            );
        }
    }

    /**
     * @notice Withdraw staked ApeCoin from the BAYC pool.  If withdraw is total staked amount, performs an automatic claim.
     * @param _nfts Array of BAYC NFT's with staked amounts
     * @param _recipient Address to send withdraw amount and claim to
     */
    function executeWithdrawBAYC(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.SingleNft[] calldata _nfts,
        address _recipient
    ) external {
        _validateWithdrawApeCoin(_owners, _nfts);
        _apeCoinStaking.withdrawBAYC(_nfts, _recipient);
    }

    /**
     * @notice Withdraw staked ApeCoin from the MAYC pool.  If withdraw is total staked amount, performs an automatic claim.
     * @param _nfts Array of MAYC NFT's with staked amounts
     * @param _recipient Address to send withdraw amount and claim to
     */
    function executeWithdrawMAYC(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.SingleNft[] calldata _nfts,
        address _recipient
    ) external {
        _validateWithdrawApeCoin(_owners, _nfts);
        _apeCoinStaking.withdrawMAYC(_nfts, _recipient);
    }

    function _validateWithdrawApeCoin(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking.SingleNft[] memory _nfts
    ) internal view {
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                _owners[_nfts[index].tokenId] == msg.sender,
                "NToken: not owner of token"
            );
        }
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
    function executeDepositBAKCWithBAYC(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.PairNftWithAmount[] calldata _nftPairs
    ) external {
        _depositBAKC(_owners, _apeCoinStaking, _nftPairs);

        ApeCoinStaking.PairNftWithAmount[]
            memory _otherPairs = new ApeCoinStaking.PairNftWithAmount[](0);

        _apeCoinStaking.depositBAKC(_nftPairs, _otherPairs);
    }

    function executeDepositBAKCWithMAYC(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.PairNftWithAmount[] calldata _nftPairs
    ) external {
        _depositBAKC(_owners, _apeCoinStaking, _nftPairs);

        ApeCoinStaking.PairNftWithAmount[]
            memory _otherPairs = new ApeCoinStaking.PairNftWithAmount[](0);

        _apeCoinStaking.depositBAKC(_otherPairs, _nftPairs);
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
    function _depositBAKC(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.PairNftWithAmount[] calldata _nftPairs
    ) internal {
        uint256 totalAmount = 0;

        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                _owners[_nftPairs[index].mainTokenId] == msg.sender,
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
    }

    /**
     * @notice Claim rewards for array of Paired NFTs and send to recipient
     * @param _nftPairs Array of Paired BAYC/MAYC NFTs owned and committed by the msg.sender
     * @param _recipient Address to send claim reward to
     */
    function executeClaimBAKCWithBAYC(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.PairNft[] calldata _nftPairs,
        address _recipient
    ) external {
        _validateClaimBAKC(_owners, _nftPairs);

        ApeCoinStaking.PairNft[]
            memory _otherPairs = new ApeCoinStaking.PairNft[](0);

        _apeCoinStaking.claimBAKC(_nftPairs, _otherPairs, _recipient);
    }

    function executeClaimBAKCWithMAYC(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.PairNft[] calldata _nftPairs,
        address _recipient
    ) external {
        _validateClaimBAKC(_owners, _nftPairs);

        ApeCoinStaking.PairNft[]
            memory _otherPairs = new ApeCoinStaking.PairNft[](0);

        _apeCoinStaking.claimBAKC(_otherPairs, _nftPairs, _recipient);
    }

    function _validateClaimBAKC(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking.PairNft[] calldata _nftPairs
    ) internal view {
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                _owners[_nftPairs[index].mainTokenId] == msg.sender,
                "NToken: not owner of token"
            );
        }
    }

    /**
     * @notice Withdraw staked ApeCoin from the Pair pool.  If withdraw is total staked amount, performs an automatic claim.
     * @param _nftPairs Array of Paired BAYC/MAYC NFT's with staked amounts
     * @dev if pairs have split ownership and BAKC is attempting a withdraw, the withdraw must be for the total staked amount
     */
    function executeWithdrawBAKCWithBAYC(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.PairNftWithAmount[] memory _nftPairs,
        address _apeRecipient,
        address _bakcRecipient
    ) external {
        _withdrawBAKC(
            _owners,
            _apeCoinStaking,
            BAYC_POOL_ID,
            _nftPairs,
            true,
            _apeRecipient,
            _bakcRecipient
        );
    }

    function executeWithdrawBAKCWithMAYC(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.PairNftWithAmount[] memory _nftPairs,
        address _apeRecipient,
        address _bakcRecipient
    ) external {
        _withdrawBAKC(
            _owners,
            _apeCoinStaking,
            MAYC_POOL_ID,
            _nftPairs,
            true,
            _apeRecipient,
            _bakcRecipient
        );
    }

    function _withdrawBAKC(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        uint256 poolId,
        ApeCoinStaking.PairNftWithAmount[] memory _nftPairs,
        bool validate,
        address _apeRecipient,
        address _bakcRecipient
    ) internal {
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            if (validate) {
                require(
                    _owners[_nftPairs[index].mainTokenId] == msg.sender,
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

        if (poolId == BAYC_POOL_ID) {
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
     * @notice This function is only called when a BAYC/MAYC collateral is liquidated or withrawn
     * The reason we call this function is to withdraw any staked apecoin or paired BAKC with the collateral
     * being liquidated
     */

    function executeAutoWithdraw(
        mapping(uint256 => address) storage _owners,
        ApeCoinStaking _apeCoinStaking,
        uint256 poolId,
        uint256[] memory tokenIds,
        address _recipient
    ) external {
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
                poolId,
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
                poolId,
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

            if (poolId == BAYC_POOL_ID) {
                _apeCoinStaking.withdrawBAYC(nfts, _recipient);
            } else {
                _apeCoinStaking.withdrawMAYC(nfts, _recipient);
            }
        }

        if (pairdBakcCounter > 0) {
            assembly {
                mstore(_bakcPairs, pairdBakcCounter)
            }
            _withdrawBAKC(
                _owners,
                _apeCoinStaking,
                poolId,
                _bakcPairs,
                false,
                _recipient,
                _recipient
            );
        }
    }
}
