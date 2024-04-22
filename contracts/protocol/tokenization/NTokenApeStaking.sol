// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {NToken} from "./NToken.sol";
import {ApeCoinStaking} from "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";
import {ApeStakingLogic} from "./libraries/ApeStakingLogic.sol";
import "../../interfaces/INTokenApeStaking.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {IP2PPairStaking} from "../../interfaces/IP2PPairStaking.sol";

/**
 * @title ApeCoinStaking NToken
 *
 * @notice Implementation of the NToken for the ParaSpace protocol
 */
abstract contract NTokenApeStaking is NToken, INTokenApeStaking {
    ApeCoinStaking immutable _apeCoinStaking;

    bytes32 constant APE_STAKING_DATA_STORAGE_POSITION =
        bytes32(
            uint256(keccak256("paraspace.proxy.ntoken.apestaking.storage")) - 1
        );

    /**
     * @dev Default percentage of borrower's ape position to be repaid as incentive in a unstaking transaction.
     * @dev Percentage applied when the users ape position got unstaked by others.
     * Expressed in bps, a value of 30 results in 0.3%
     */
    uint256 internal constant DEFAULT_UNSTAKE_INCENTIVE_PERCENTAGE = 30;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(
        IPool pool,
        address apeCoinStaking,
        address delegateRegistry
    ) NToken(pool, false, delegateRegistry) {
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
        IERC20 _apeCoin = _apeCoinStaking.apeCoin();
        //approve for apeCoinStaking
        uint256 allowance = IERC20(_apeCoin).allowance(
            address(this),
            address(_apeCoinStaking)
        );
        if (allowance == 0) {
            IERC20(_apeCoin).approve(
                address(_apeCoinStaking),
                type(uint256).max
            );
        }
        //approve for Pool contract
        allowance = IERC20(_apeCoin).allowance(address(this), address(POOL));
        if (allowance == 0) {
            IERC20(_apeCoin).approve(address(POOL), type(uint256).max);
        }
        getBAKC().setApprovalForAll(address(POOL), true);

        super.initialize(
            initializingPool,
            underlyingAsset,
            incentivesController,
            nTokenName,
            nTokenSymbol,
            params
        );

        initializeStakingData();
    }

    /**
     * @notice Returns the address of BAKC contract address.
     **/
    function getBAKC() public view returns (IERC721) {
        return _apeCoinStaking.nftContracts(ApeStakingLogic.BAKC_POOL_ID);
    }

    /**
     * @notice Returns the address of ApeCoinStaking contract address.
     **/
    function getApeStaking() external view returns (ApeCoinStaking) {
        return _apeCoinStaking;
    }

    /**
     * @notice Overrides the _transfer from NToken to withdraw all staked and pending rewards before transfer the asset
     */
    function _transfer(
        address from,
        address to,
        uint256 tokenId,
        bool validate
    ) internal override {
        ApeStakingLogic.executeUnstakePositionAndRepay(
            _ERC721Data.owners,
            apeStakingDataStorage(),
            ApeStakingLogic.UnstakeAndRepayParams({
                POOL: POOL,
                _apeCoinStaking: _apeCoinStaking,
                _underlyingAsset: _ERC721Data.underlyingAsset,
                poolId: POOL_ID(),
                tokenId: tokenId,
                incentiveReceiver: address(0),
                bakcNToken: getBAKCNTokenAddress()
            })
        );
        _clearP2PDelegationInfo(tokenId);
        super._transfer(from, to, tokenId, validate);
    }

    /**
     * @notice Overrides the burn from NToken to withdraw all staked and pending rewards before burning the NToken on liquidation/withdraw
     */
    function burn(
        address from,
        address receiverOfUnderlying,
        uint256[] calldata tokenIds,
        DataTypes.TimeLockParams calldata timeLockParams
    ) external virtual override onlyPool nonReentrant returns (uint64, uint64) {
        for (uint256 index = 0; index < tokenIds.length; index++) {
            ApeStakingLogic.executeUnstakePositionAndRepay(
                _ERC721Data.owners,
                apeStakingDataStorage(),
                ApeStakingLogic.UnstakeAndRepayParams({
                    POOL: POOL,
                    _apeCoinStaking: _apeCoinStaking,
                    _underlyingAsset: _ERC721Data.underlyingAsset,
                    poolId: POOL_ID(),
                    tokenId: tokenIds[index],
                    incentiveReceiver: address(0),
                    bakcNToken: getBAKCNTokenAddress()
                })
            );
        }

        return _burn(from, receiverOfUnderlying, tokenIds, timeLockParams);
    }

    function POOL_ID() internal pure virtual returns (uint256) {
        // should be overridden
        return 0;
    }

    function initializeStakingData() internal {
        ApeStakingLogic.APEStakingParameter
            storage dataStorage = apeStakingDataStorage();
        ApeStakingLogic.executeSetUnstakeApeIncentive(
            dataStorage,
            DEFAULT_UNSTAKE_INCENTIVE_PERCENTAGE
        );
    }

    function setUnstakeApeIncentive(uint256 incentive) external onlyPoolAdmin {
        ApeStakingLogic.executeSetUnstakeApeIncentive(
            apeStakingDataStorage(),
            incentive
        );
    }

    function setP2PPairStaking(address p2PStaking) external onlyPoolAdmin {
        ApeStakingLogic.executeSetP2PPairStaking(
            apeStakingDataStorage(),
            p2PStaking
        );
    }

    function apeStakingDataStorage()
        internal
        pure
        returns (ApeStakingLogic.APEStakingParameter storage rgs)
    {
        bytes32 position = APE_STAKING_DATA_STORAGE_POSITION;
        assembly {
            rgs.slot := position
        }
    }

    /**
     * @notice Unstake Ape coin staking position and repay user debt
     * @param tokenId Token id of the ape staking position on
     * @param incentiveReceiver address to receive incentive
     */
    function unstakePositionAndRepay(
        uint256 tokenId,
        address incentiveReceiver
    ) external nonReentrant {
        address bakcNToken = getBAKCNTokenAddress();
        require(
            msg.sender == address(POOL) || msg.sender == bakcNToken,
            "Invalid Caller"
        );
        ApeStakingLogic.executeUnstakePositionAndRepay(
            _ERC721Data.owners,
            apeStakingDataStorage(),
            ApeStakingLogic.UnstakeAndRepayParams({
                POOL: POOL,
                _apeCoinStaking: _apeCoinStaking,
                _underlyingAsset: _ERC721Data.underlyingAsset,
                poolId: POOL_ID(),
                tokenId: tokenId,
                incentiveReceiver: incentiveReceiver,
                bakcNToken: bakcNToken
            })
        );
    }

    /**
     * @notice get user total ape staking position
     * @param user user address
     */
    function getUserApeStakingAmount(
        address user
    ) external view returns (uint256) {
        return
            ApeStakingLogic.getUserTotalStakingAmount(
                _ERC721Data.userState,
                _ERC721Data.ownedTokens,
                _ERC721Data.underlyingAsset,
                user,
                POOL_ID(),
                _apeCoinStaking
            );
    }

    function getBAKCNTokenAddress() internal view returns (address) {
        return POOL.getReserveData(address(getBAKC())).xTokenAddress;
    }

    function _clearP2PDelegationInfo(uint256 tokenId) internal {
        address p2PStaking = apeStakingDataStorage().p2PStaking;
        if (p2PStaking != address(0)) {
            IP2PPairStaking(p2PStaking).clearDelegation(
                _ERC721Data.underlyingAsset,
                tokenId
            );
        }
    }
}
