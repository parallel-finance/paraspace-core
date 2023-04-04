// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IStakefishNFTManager} from "../interfaces/IStakefishNFTManager.sol";
import {IStakefishValidator} from "../interfaces/IStakefishValidator.sol";
import {SafeCast} from "../dependencies/univ3/libraries/SafeCast.sol";
import {IAtomicPriceAggregator} from "../interfaces/IAtomicPriceAggregator.sol";

contract StakefishNFTOracleWrapper is IAtomicPriceAggregator {
    using SafeCast for uint256;

    IStakefishNFTManager immutable STAKEFISH_NFT_MANAGER;

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

        if (lastState.state < IStakefishValidator.State.PostDeposit) {
            return availableBalance;
        }

        if (lastState.state <= IStakefishValidator.State.Exited) {
            // 1. already withdrawn
            if (withdrawnBalance >= 32 ether) {
                uint256 commission = (availableBalance *
                    IStakefishValidator(validatorAddr).getProtocolFee()) /
                    10000;

                return availableBalance - commission;
            } else {
                // 2. funds not arrive at the validator contract yet
                if (withdrawnBalance + availableBalance <= 32 ether) {
                    return 32 ether + availableBalance;
                } else {
                    // 3. funds arrived at the validator contract
                    uint256 commissionApplyBalance = availableBalance +
                        withdrawnBalance -
                        32 ether;
                    uint256 commission = (commissionApplyBalance *
                        IStakefishValidator(validatorAddr).getProtocolFee()) /
                        10000;
                    return availableBalance + withdrawnBalance - commission;
                }
            }
        }

        return 0;
    }
}
