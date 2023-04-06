// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IStakefishNFTManager} from "../interfaces/IStakefishNFTManager.sol";
import {IStakefishValidator} from "../interfaces/IStakefishValidator.sol";
import {SafeCast} from "../dependencies/univ3/libraries/SafeCast.sol";
import {IAtomicPriceAggregator} from "../interfaces/IAtomicPriceAggregator.sol";

contract StakefishNFTOracleWrapper is IAtomicPriceAggregator {
    using SafeCast for uint256;

    IStakefishNFTManager immutable STAKEFISH_NFT_MANAGER;

    // 28 ether is used to take slashes & penalties into account
    // this is important since both withdrawnBalance, availableBalance and deposited 32 ether
    // are quite dynamic & can be manipulated.
    //
    // the original 32 ether is either in:
    //   - withdrawnBalance
    //   - availableBalance
    //   - deposit contract
    // we use 28 ether to detect where it is
    uint256 public constant MIN_FULL_WITHDRAWAL = 28 ether;

    constructor(address _stakefishNFTManager) {
        STAKEFISH_NFT_MANAGER = IStakefishNFTManager(_stakefishNFTManager);
    }

    function getTokenPrice(uint256 tokenId) public view returns (uint256) {
        address validatorAddr = STAKEFISH_NFT_MANAGER.validatorForTokenId(
            tokenId
        );
        IStakefishValidator.StateChange memory lastState = IStakefishValidator(
            validatorAddr
        ).lastStateChange();
        uint256 availableBalance = address(validatorAddr).balance;
        uint256 withdrawnBalance = IStakefishValidator(validatorAddr)
            .withdrawnBalance();

        // funds are not deposited into deposit contract yet
        if (lastState.state < IStakefishValidator.State.PostDeposit) {
            return availableBalance;
        }

        if (lastState.state < IStakefishValidator.State.Withdrawn) {
            // 1. already withdrawn
            if (withdrawnBalance >= MIN_FULL_WITHDRAWAL) {
                uint256 commission = (availableBalance *
                    IStakefishValidator(validatorAddr).getProtocolFee()) /
                    10000;

                return availableBalance - commission;
            }

            // 2. full withdrawal funds arrived via system operations
            if (availableBalance >= MIN_FULL_WITHDRAWAL) {
                if (withdrawnBalance + availableBalance <= 32 ether) {
                    return availableBalance;
                } else {
                    uint256 commissionApplyBalance = availableBalance +
                        withdrawnBalance -
                        32 ether;
                    uint256 commission = (commissionApplyBalance *
                        IStakefishValidator(validatorAddr).getProtocolFee()) /
                        10000;
                    return availableBalance - commission;
                }
            }

            // 3. funds are still in deposit contract and validator didn't exit
            return 32 ether + availableBalance;
        }

        return 0;
    }
}
