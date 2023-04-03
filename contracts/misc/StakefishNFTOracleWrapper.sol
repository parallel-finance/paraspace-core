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

        if (
            lastState.state < IStakefishValidator.State.Active ||
            lastState.state > IStakefishValidator.State.Exited
        ) {
            return 0;
        }

        // TODO: which api to get the principal?
        return 0;
    }
}
