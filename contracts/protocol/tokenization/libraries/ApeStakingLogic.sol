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
import "./MintableERC721Logic.sol";

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

    struct APEStakingParameter {
        uint256 unstakeIncentive;
    }
    event UnstakeApeIncentiveUpdated(uint256 oldValue, uint256 newValue);

    function withdrawBAKC(
        ApeCoinStaking _apeCoinStaking,
        uint256 poolId,
        ApeCoinStaking.PairNftWithAmount[] memory _nftPairs,
        address _apeRecipient
    ) external {
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

    function getUserTotalStakingAmount(
        mapping(address => UserState) storage userState,
        mapping(address => mapping(uint256 => uint256)) storage ownedTokens,
        address user,
        uint256 poolId,
        ApeCoinStaking _apeCoinStaking
    ) external view returns (uint256) {
        uint256 totalBalance = uint256(userState[user].balance);
        uint256 totalAmount;
        for (uint256 index = 0; index < totalBalance; index++) {
            uint256 tokenId = ownedTokens[user][index];
            totalAmount += getTokenIdStakingAmount(
                poolId,
                _apeCoinStaking,
                tokenId
            );
        }

        return totalAmount;
    }

    function getTokenIdStakingAmount(
        uint256 poolId,
        ApeCoinStaking _apeCoinStaking,
        uint256 tokenId
    ) public view returns (uint256) {
        (uint256 apeStakedAmount, ) = _apeCoinStaking.nftPosition(
            poolId,
            tokenId
        );

        uint256 apeReward = _apeCoinStaking.pendingRewards(
            poolId,
            address(this),
            tokenId
        );

        (uint256 bakcTokenId, bool isPaired) = _apeCoinStaking.mainToBakc(
            poolId,
            tokenId
        );

        if (isPaired) {
            (uint256 bakcStakedAmount, ) = _apeCoinStaking.nftPosition(
                BAKC_POOL_ID,
                bakcTokenId
            );
            apeStakedAmount += bakcStakedAmount;

            apeReward += _apeCoinStaking.pendingRewards(
                BAKC_POOL_ID,
                address(this),
                bakcTokenId
            );
        }

        return apeStakedAmount + apeReward;
    }
}
