// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;
import {ApeCoinStaking} from "../../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {IERC721} from "../../../dependencies/openzeppelin/contracts/IERC721.sol";
import {SafeERC20} from "../../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";
import "../../../interfaces/IPool.sol";
import {DataTypes} from "../../libraries/types/DataTypes.sol";
import {PercentageMath} from "../../libraries/math/PercentageMath.sol";
import {Math} from "../../../dependencies/openzeppelin/contracts/Math.sol";

/**
 * @title ApeStakingLogic library
 *
 * @notice Implements the base logic for ApeStaking
 */
library ApeStakingLogic {
    using SafeERC20 for IERC20;
    using PercentageMath for uint256;

    uint256 constant BAYC_POOL_ID = 1;
    uint256 constant MAYC_POOL_ID = 2;
    uint256 constant BAKC_POOL_ID = 3;

    uint256 public constant HEALTH_FACTOR_LIQUIDATION_THRESHOLD = 1e18;
    struct APEStakingParameter {
        uint256 unstakeHFLimit;
        uint256 unstakeIncentive;
    }
    event UnstakeApeHFLimitUpdated(uint256 oldValue, uint256 newValue);
    event UnstakeApeIncentiveUpdated(uint256 oldValue, uint256 newValue);

    /**
     * @notice Deposit ApeCoin to the BAYC Pool
     * @param _nfts Array of SingleNft structs
     * @dev Commits 1 or more BAYC NFTs, each with an ApeCoin amount to the BAYC pool.\
     * Each BAYC committed must attach an ApeCoin amount >= 1 ApeCoin and <= the BAYC pool cap amount.
     */
    function executeDepositBAYC(
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.SingleNft[] calldata _nfts
    ) external {
        _apeCoinStaking.depositBAYC(_nfts);
    }

    /**
     * @notice Deposit ApeCoin to the MAYC Pool
     * @param _nfts Array of SingleNft structs
     * @dev Commits 1 or more MAYC NFTs, each with an ApeCoin amount to the MAYC pool.\
     * Each MAYC committed must attach an ApeCoin amount >= 1 ApeCoin and <= the MAYC pool cap amount.
     */
    function executeDepositMAYC(
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.SingleNft[] calldata _nfts
    ) external {
        _apeCoinStaking.depositMAYC(_nfts);
    }

    /**
     * @notice Claim rewards for array of BAYC NFTs and send to recipient
     * @param _nfts Array of NFTs owned and committed by the msg.sender
     * @param _recipient Address to send claim reward to
     */
    function executeClaimBAYC(
        ApeCoinStaking _apeCoinStaking,
        uint256[] calldata _nfts,
        address _recipient
    ) external {
        _apeCoinStaking.claimBAYC(_nfts, _recipient);
    }

    /**
     * @notice Claim rewards for array of MAYC NFTs and send to recipient
     * @param _nfts Array of NFTs owned and committed by the msg.sender
     * @param _recipient Address to send claim reward to
     */
    function executeClaimMAYC(
        ApeCoinStaking _apeCoinStaking,
        uint256[] calldata _nfts,
        address _recipient
    ) external {
        _apeCoinStaking.claimMAYC(_nfts, _recipient);
    }

    /**
     * @notice Withdraw staked ApeCoin from the BAYC pool.  If withdraw is total staked amount, performs an automatic claim.
     * @param _nfts Array of BAYC NFT's with staked amounts
     * @param _recipient Address to send withdraw amount and claim to
     */
    function executeWithdrawBAYC(
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.SingleNft[] calldata _nfts,
        address _recipient
    ) external {
        _apeCoinStaking.withdrawBAYC(_nfts, _recipient);
    }

    /**
     * @notice Withdraw staked ApeCoin from the MAYC pool.  If withdraw is total staked amount, performs an automatic claim.
     * @param _nfts Array of MAYC NFT's with staked amounts
     * @param _recipient Address to send withdraw amount and claim to
     */
    function executeWithdrawMAYC(
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.SingleNft[] calldata _nfts,
        address _recipient
    ) external {
        _apeCoinStaking.withdrawMAYC(_nfts, _recipient);
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
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.PairNftWithAmount[] calldata _nftPairs
    ) external {
        ApeCoinStaking.PairNftWithAmount[]
            memory _otherPairs = new ApeCoinStaking.PairNftWithAmount[](0);

        _apeCoinStaking.depositBAKC(_nftPairs, _otherPairs);
    }

    function executeDepositBAKCWithMAYC(
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.PairNftWithAmount[] calldata _nftPairs
    ) external {
        ApeCoinStaking.PairNftWithAmount[]
            memory _otherPairs = new ApeCoinStaking.PairNftWithAmount[](0);

        _apeCoinStaking.depositBAKC(_otherPairs, _nftPairs);
    }

    /**
     * @notice Claim rewards for array of Paired NFTs and send to recipient
     * @param _nftPairs Array of Paired BAYC/MAYC NFTs owned and committed by the msg.sender
     * @param _recipient Address to send claim reward to
     */
    function executeClaimBAKCWithBAYC(
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.PairNft[] calldata _nftPairs,
        address _recipient
    ) external {
        ApeCoinStaking.PairNft[]
            memory _otherPairs = new ApeCoinStaking.PairNft[](0);

        _apeCoinStaking.claimBAKC(_nftPairs, _otherPairs, _recipient);
    }

    function executeClaimBAKCWithMAYC(
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.PairNft[] calldata _nftPairs,
        address _recipient
    ) external {
        ApeCoinStaking.PairNft[]
            memory _otherPairs = new ApeCoinStaking.PairNft[](0);

        _apeCoinStaking.claimBAKC(_otherPairs, _nftPairs, _recipient);
    }

    /**
     * @notice Withdraw staked ApeCoin from the Pair pool.  If withdraw is total staked amount, performs an automatic claim.
     * @param _nftPairs Array of Paired BAYC/MAYC NFT's with staked amounts
     * @dev if pairs have split ownership and BAKC is attempting a withdraw, the withdraw must be for the total staked amount
     */
    function executeWithdrawBAKCWithBAYC(
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.PairNftWithAmount[] memory _nftPairs,
        address _apeRecipient
    ) external {
        _withdrawBAKC(_apeCoinStaking, BAYC_POOL_ID, _nftPairs, _apeRecipient);
    }

    function executeWithdrawBAKCWithMAYC(
        ApeCoinStaking _apeCoinStaking,
        ApeCoinStaking.PairNftWithAmount[] memory _nftPairs,
        address _apeRecipient
    ) external {
        _withdrawBAKC(_apeCoinStaking, MAYC_POOL_ID, _nftPairs, _apeRecipient);
    }

    function _withdrawBAKC(
        ApeCoinStaking _apeCoinStaking,
        uint256 poolId,
        ApeCoinStaking.PairNftWithAmount[] memory _nftPairs,
        address _apeRecipient
    ) internal {
        ApeCoinStaking.PairNftWithAmount[]
            memory _otherPairs = new ApeCoinStaking.PairNftWithAmount[](0);

        if (poolId == BAYC_POOL_ID) {
            _apeCoinStaking.withdrawBAKC(_nftPairs, _otherPairs);
        } else {
            _apeCoinStaking.withdrawBAKC(_otherPairs, _nftPairs);
        }

        uint256 balance = _apeCoinStaking.apeCoin().balanceOf(address(this));

        _apeCoinStaking.apeCoin().safeTransfer(_apeRecipient, balance);
    }

    function executeSetUnstakeApeHFLimit(
        APEStakingParameter storage stakingParameter,
        uint256 hfLimit
    ) external {
        require(hfLimit > HEALTH_FACTOR_LIQUIDATION_THRESHOLD, "Value Too Low");
        require(
            hfLimit < HEALTH_FACTOR_LIQUIDATION_THRESHOLD * 2,
            "Value Too High"
        );
        uint256 oldValue = stakingParameter.unstakeHFLimit;
        require(oldValue != hfLimit, "Same Value");
        stakingParameter.unstakeHFLimit = hfLimit;
        emit UnstakeApeHFLimitUpdated(oldValue, hfLimit);
    }

    function executeSetUnstakeApeIncentive(
        APEStakingParameter storage stakingParameter,
        uint256 incentive
    ) external {
        require(
            incentive < PercentageMath.HALF_PERCENTAGE_FACTOR,
            "Value Too High"
        );
        uint256 oldValue = stakingParameter.unstakeIncentive;
        require(oldValue != incentive, "Same Value");
        stakingParameter.unstakeIncentive = incentive;
        emit UnstakeApeIncentiveUpdated(oldValue, incentive);
    }

    function executeUnstakePositionAndRepay(
        mapping(uint256 => address) storage _owners,
        APEStakingParameter storage stakingParameter,
        IPool POOL,
        ApeCoinStaking _apeCoinStaking,
        uint256 poolId,
        uint256 tokenId,
        address incentiveReceiver
    ) external {
        address positionOwner = _owners[tokenId];

        //1 unstake all position
        {
            //1.1 unstake Main pool position
            (uint256 stakedAmount, ) = _apeCoinStaking.nftPosition(
                poolId,
                tokenId
            );
            if (stakedAmount > 0) {
                ApeCoinStaking.SingleNft[]
                    memory nfts = new ApeCoinStaking.SingleNft[](1);
                nfts[0].tokenId = tokenId;
                nfts[0].amount = stakedAmount;
                if (poolId == BAYC_POOL_ID) {
                    _apeCoinStaking.withdrawBAYC(nfts, address(this));
                } else {
                    _apeCoinStaking.withdrawMAYC(nfts, address(this));
                }
            }
            //1.2 unstake bakc pool position
            (uint256 bakcTokenId, bool isPaired) = _apeCoinStaking.mainToBakc(
                poolId,
                tokenId
            );
            if (isPaired) {
                (stakedAmount, ) = _apeCoinStaking.nftPosition(
                    BAKC_POOL_ID,
                    bakcTokenId
                );
                if (stakedAmount > 0) {
                    ApeCoinStaking.PairNftWithAmount[]
                        memory _nftPairs = new ApeCoinStaking.PairNftWithAmount[](
                            1
                        );
                    _nftPairs[0].mainTokenId = tokenId;
                    _nftPairs[0].bakcTokenId = bakcTokenId;
                    _nftPairs[0].amount = stakedAmount;
                    ApeCoinStaking.PairNftWithAmount[]
                        memory _otherPairs = new ApeCoinStaking.PairNftWithAmount[](
                            0
                        );

                    if (poolId == BAYC_POOL_ID) {
                        _apeCoinStaking.withdrawBAKC(_nftPairs, _otherPairs);
                    } else {
                        _apeCoinStaking.withdrawBAKC(_otherPairs, _nftPairs);
                    }
                    IERC721(_apeCoinStaking.nftContracts(BAKC_POOL_ID))
                        .transferFrom(
                            address(this),
                            positionOwner,
                            bakcTokenId
                        );
                }
            }
        }

        IERC20 _apeCoin = _apeCoinStaking.apeCoin();
        uint256 apeBalance = _apeCoin.balanceOf(address(this));
        if (apeBalance == 0) {
            return;
        }
        //2 send incentive to caller
        if (incentiveReceiver != address(0)) {
            uint256 unstakeIncentive = stakingParameter.unstakeIncentive;
            if (unstakeIncentive > 0) {
                uint256 incentiveAmount = apeBalance.percentMul(
                    unstakeIncentive
                );
                _apeCoin.safeTransfer(incentiveReceiver, incentiveAmount);
                apeBalance = apeBalance - incentiveAmount;
            }
        }

        //3 repay ape coin debt if user have
        DataTypes.ReserveData memory apeCoinData = POOL.getReserveData(
            address(_apeCoin)
        );
        uint256 userDebt = IERC20(apeCoinData.variableDebtTokenAddress)
            .balanceOf(positionOwner);
        if (userDebt > 0) {
            uint256 repayDebt = Math.min(userDebt, apeBalance);
            POOL.repay(address(_apeCoin), repayDebt, positionOwner);
            apeBalance = apeBalance - repayDebt;
        }

        //4 supply remaining ape coin
        if (apeBalance > 0) {
            POOL.supply(address(_apeCoin), apeBalance, positionOwner, 0);
        }
    }

    function isApeStakingPositionExisted(
        uint256 poolId,
        ApeCoinStaking _apeCoinStaking,
        uint256[] memory tokenIds
    ) external view returns (bool) {
        uint256 tokenIdLength = tokenIds.length;
        for (uint256 index = 0; index < tokenIdLength; index++) {
            (uint256 stakedAmount, ) = _apeCoinStaking.nftPosition(
                poolId,
                tokenIds[index]
            );

            if (stakedAmount > 0) {
                return true;
            }

            (, bool isPaired) = _apeCoinStaking.mainToBakc(
                poolId,
                tokenIds[index]
            );
            if (isPaired) {
                return true;
            }
        }

        return false;
    }
}
