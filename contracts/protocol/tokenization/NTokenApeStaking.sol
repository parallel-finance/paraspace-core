// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {NToken} from "./NToken.sol";
import {ApeCoinStaking} from "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";
import {ApeStakingLogic} from "./libraries/ApeStakingLogic.sol";
import {MintableERC721Logic} from "./libraries/MintableERC721Logic.sol";
import {Errors} from "../libraries/helpers/Errors.sol";

import "../../interfaces/INTokenApeStaking.sol";

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

    function _onlyApeRescueAdmin() private view {
        ApeStakingLogic.APEStakingParameter storage s = apeStakingDataStorage();

        require(msg.sender == s.apeRescueAdmin, Errors.CALLER_NOT_ADMIN);
    }

    /**
     * @dev Only pool admin can call functions marked by this modifier.
     **/
    modifier onlyApeRescueAdmin() {
        _onlyApeRescueAdmin();
        _;
    }

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
        super._transfer(from, to, tokenId, validate);
    }

    /**
     * @notice Overrides the burn from NToken to withdraw all staked and pending rewards before burning the NToken on liquidation/withdraw
     */
    function burn(
        address from,
        address receiverOfUnderlying,
        uint256[] calldata tokenIds
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

        return _burn(from, receiverOfUnderlying, tokenIds);
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
    function unstakePositionAndRepay(uint256 tokenId, address incentiveReceiver)
        external
        nonReentrant
    {
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
    function getUserApeStakingAmount(address user)
        external
        view
        returns (uint256)
    {
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

    function setApeRescueAdmin(address newAdmin) external onlyPoolAdmin {
        require(newAdmin != address(0), Errors.ZERO_ADDRESS_NOT_VALID);

        ApeStakingLogic.APEStakingParameter storage s = apeStakingDataStorage();
        s.apeRescueAdmin = newAdmin;
    }

    function rescueLockedAPE(uint256 amount, address to)
        external
        onlyApeRescueAdmin
    {
        IERC20 _apeCoin = _apeCoinStaking.apeCoin();

        MintableERC721Logic.executeRescueERC20(address(_apeCoin), to, amount);
    }

    function updateApeRescueClaim(
        uint256 tokenId,
        bytes32 txHash,
        uint128 amount,
        ApeStakingLogic.APERescueClaimStatus status
    ) external onlyApeRescueAdmin {
        ApeStakingLogic.APEStakingParameter storage s = apeStakingDataStorage();
        ApeStakingLogic.ClaimData memory claimData = s.apeRescueClaims[tokenId][
            txHash
        ];

        require(
            claimData.status != ApeStakingLogic.APERescueClaimStatus.CLAIMED,
            "Already Claimed"
        );
        require(amount > 0, "amount can't be zero");

        s.apeRescueClaims[tokenId][txHash].amount = amount;
        s.apeRescueClaims[tokenId][txHash].status = status;
    }

    function claimLockedAPE(uint256 tokenId, bytes32 txHash) external {
        ApeStakingLogic.APEStakingParameter storage s = apeStakingDataStorage();
        ApeStakingLogic.ClaimData memory claimData = s.apeRescueClaims[tokenId][
            txHash
        ];

        require(
            claimData.status == ApeStakingLogic.APERescueClaimStatus.APPROVED,
            "Claim not approved"
        );
        require(
            IERC721(_ERC721Data.underlyingAsset).ownerOf(tokenId) ==
                msg.sender ||
                ownerOf(tokenId) == msg.sender,
            Errors.NOT_THE_OWNER
        );

        s.apeRescueClaims[tokenId][txHash].status = ApeStakingLogic
            .APERescueClaimStatus
            .CLAIMED;

        IERC20 _apeCoin = _apeCoinStaking.apeCoin();
        MintableERC721Logic.executeRescueERC20(
            address(_apeCoin),
            msg.sender,
            claimData.amount
        );
    }
}
