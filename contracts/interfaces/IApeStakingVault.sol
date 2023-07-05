// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

import "../dependencies/openzeppelin/contracts/IERC20.sol";
import "../dependencies/yoga-labs/ApeCoinStaking.sol";

interface IApeStakingVault {
    struct PairingStatus {
        uint248 tokenId;
        bool isPaired;
    }
    struct PoolState {
        uint256 accumulatedRewardsPerNft;
        uint256 totalPosition;
        //tokenId => reward debt position
        mapping(uint256 => uint256) rewardsDebt;
        //apeTokenId => PairingStatus
        mapping(uint256 => PairingStatus) pairStatus;
        uint256 cApeDebtShare;
    }
}
