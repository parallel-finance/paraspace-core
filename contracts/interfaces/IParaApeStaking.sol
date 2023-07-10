// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

import "../dependencies/openzeppelin/contracts/IERC20.sol";
import "../dependencies/yoga-labs/ApeCoinStaking.sol";
import "./IApeStakingVault.sol";
import "./IApeStakingP2P.sol";

interface IParaApeStaking is IApeStakingVault, IApeStakingP2P {
    struct ApeStakingVaultCacheVars {
        address pool;
        address bayc;
        address mayc;
        address bakc;
        address nBayc;
        address nMayc;
        address nBakc;
        address apeCoin;
        address cApe;
        ApeCoinStaking apeCoinStaking;
        uint256 baycMatchedCap;
        uint256 maycMatchedCap;
        uint256 bakcMatchedCap;
        //optional
        bytes32 DOMAIN_SEPARATOR;
        uint256 compoundFee;
        address apeToken;
        address nApe;
        uint256 apeStakingPoolId;
        uint256 positionCap;
        uint128 accumulatedRewardsPerNft;
        uint256 balanceBefore;
        uint256 balanceAfter;
        uint256 totalClaimedApe;
        uint256 apeRewardRatio;
        uint256 totalRepay;
        uint256 totalCompoundFee;
        bool isPaired;
    }

    /**
     * @dev Emitted during setApeStakingBot()
     * @param oldBot The address of the old compound bot
     * @param newBot The address of the new compound bot
     **/
    event ApeStakingBotUpdated(address oldBot, address newBot);

    event CompoundFeeUpdated(uint64 oldValue, uint64 newValue);
}
