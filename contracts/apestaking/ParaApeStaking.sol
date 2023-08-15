// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../interfaces/IParaApeStaking.sol";
import "../dependencies/openzeppelin/upgradeability/Initializable.sol";
import "../dependencies/openzeppelin/upgradeability/ReentrancyGuardUpgradeable.sol";
import "../dependencies/openzeppelin/upgradeability/PausableUpgradeable.sol";
import {IERC20, SafeERC20} from "../dependencies/openzeppelin/contracts/SafeERC20.sol";
import "../dependencies/openzeppelin/contracts/SafeCast.sol";
import "../dependencies/openzeppelin/contracts/Multicall.sol";
import "../dependencies/yoga-labs/ApeCoinStaking.sol";
import "../interfaces/IACLManager.sol";
import "../interfaces/ICApe.sol";
import {PercentageMath} from "../protocol/libraries/math/PercentageMath.sol";
import "./logic/ApeStakingP2PLogic.sol";
import "./logic/ApeStakingPairPoolLogic.sol";
import "./logic/ApeStakingSinglePoolLogic.sol";
import "./logic/ApeCoinPoolLogic.sol";
import "./logic/ApeStakingCommonLogic.sol";
import "../protocol/libraries/helpers/Errors.sol";

contract ParaApeStaking is
    Initializable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    Multicall,
    IParaApeStaking
{
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    //keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant EIP712_DOMAIN =
        0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;

    address internal immutable pool;
    address internal immutable bayc;
    address internal immutable mayc;
    address internal immutable bakc;
    address internal immutable nBayc;
    address internal immutable nMayc;
    address internal immutable nBakc;
    address internal immutable apeCoin;
    address internal immutable cApe;
    ApeCoinStaking internal immutable apeCoinStaking;
    uint256 private immutable baycMatchedCap;
    uint256 private immutable maycMatchedCap;
    uint256 private immutable bakcMatchedCap;
    IACLManager private immutable aclManager;
    uint16 public immutable sApeReserveId;
    address private immutable psApe;

    //record all pool states
    mapping(uint256 => PoolState) public poolStates;

    //record user sApe balance
    mapping(address => SApeBalance) private sApeBalance;

    //P2P storage
    bytes32 internal DOMAIN_SEPARATOR;
    mapping(bytes32 => ListingOrderStatus) public listingOrderStatus;
    mapping(bytes32 => MatchedOrder) public matchedOrders;

    //record Ape in P2P and ApeCoin pool
    mapping(address => mapping(uint32 => uint256)) private apeMatchedCount;
    mapping(address => uint256) private cApeShareBalance;

    address public apeStakingBot;
    uint64 public compoundFee;
    uint32 apePairStakingRewardRatio;

    constructor(
        address _pool,
        address _bayc,
        address _mayc,
        address _bakc,
        address _nBayc,
        address _nMayc,
        address _nBakc,
        address _apeCoin,
        address _cApe,
        address _apeCoinStaking,
        address _aclManager
    ) {
        pool = _pool;
        bayc = _bayc;
        mayc = _mayc;
        bakc = _bakc;
        nBayc = _nBayc;
        nMayc = _nMayc;
        nBakc = _nBakc;
        apeCoin = _apeCoin;
        cApe = _cApe;
        apeCoinStaking = ApeCoinStaking(_apeCoinStaking);
        aclManager = IACLManager(_aclManager);

        (
            ,
            ApeCoinStaking.PoolUI memory baycPool,
            ApeCoinStaking.PoolUI memory maycPool,
            ApeCoinStaking.PoolUI memory bakcPool
        ) = apeCoinStaking.getPoolsUI();

        baycMatchedCap = baycPool.currentTimeRange.capPerPosition;
        maycMatchedCap = maycPool.currentTimeRange.capPerPosition;
        bakcMatchedCap = bakcPool.currentTimeRange.capPerPosition;

        DataTypes.ReserveData memory sApeData = IPool(_pool).getReserveData(
            DataTypes.SApeAddress
        );
        psApe = sApeData.xTokenAddress;
        sApeReserveId = sApeData.id;
    }

    function initialize() public initializer {
        __ReentrancyGuard_init();
        __Pausable_init();

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                EIP712_DOMAIN,
                //keccak256("ParaSpace"),
                0x88d989289235fb06c18e3c2f7ea914f41f773e86fb0073d632539f566f4df353,
                //keccak256(bytes("1")),
                0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6,
                block.chainid,
                address(this)
            )
        );

        //approve ApeCoin for apeCoinStaking
        IERC20(apeCoin).safeApprove(address(apeCoinStaking), type(uint256).max);
        //approve ApeCoin for cApe
        IERC20(apeCoin).safeApprove(cApe, type(uint256).max);
        //approve cApe for pool
        IERC20(cApe).safeApprove(pool, type(uint256).max);
    }

    /**
     * @dev Only pool admin can call functions marked by this modifier.
     **/
    modifier onlyPoolAdmin() {
        _onlyPoolAdmin();
        _;
    }

    /**
     * @dev Only emergency or pool admin can call functions marked by this modifier.
     **/
    modifier onlyEmergencyOrPoolAdmin() {
        _onlyPoolOrEmergencyAdmin();
        _;
    }

    modifier onlyApeStakingBot() {
        require(apeStakingBot == msg.sender, Errors.NOT_APE_STAKING_BOT);
        _;
    }

    function _onlyPoolAdmin() internal view {
        require(
            aclManager.isPoolAdmin(msg.sender),
            Errors.CALLER_NOT_POOL_ADMIN
        );
    }

    function _onlyPoolOrEmergencyAdmin() internal view {
        require(
            aclManager.isPoolAdmin(msg.sender) ||
                aclManager.isEmergencyAdmin(msg.sender),
            Errors.CALLER_NOT_POOL_OR_EMERGENCY_ADMIN
        );
    }

    function setApeStakingBot(address _apeStakingBot) external onlyPoolAdmin {
        address oldValue = apeStakingBot;
        if (oldValue != _apeStakingBot) {
            apeStakingBot = _apeStakingBot;
            emit ApeStakingBotUpdated(oldValue, _apeStakingBot);
        }
    }

    function setCompoundFee(uint64 _compoundFee) external onlyPoolAdmin {
        //0.1e4 means 10%
        require(_compoundFee <= 0.1e4, Errors.INVALID_PARAMETER);
        uint64 oldValue = compoundFee;
        if (oldValue != _compoundFee) {
            compoundFee = _compoundFee;
            emit CompoundFeeUpdated(oldValue, _compoundFee);
        }
    }

    function claimCompoundFee(address receiver) external onlyApeStakingBot {
        this.claimCApeReward(receiver);
    }

    /**
     * @notice Pauses the contract. Only pool admin or emergency admin can call this function
     **/
    function pause() external onlyEmergencyOrPoolAdmin {
        _pause();
    }

    /**
     * @notice Unpause the contract. Only pool admin can call this function
     **/
    function unpause() external onlyPoolAdmin {
        _unpause();
    }

    /**
     * @notice Rescue erc20 from this contract address. Only pool admin can call this function
     * @param token The token address to be rescued, _yieldToken cannot be rescued.
     * @param to The account address to receive token
     * @param amount The amount to be rescued
     **/
    function rescueERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyPoolAdmin {
        IERC20(token).safeTransfer(to, amount);
        emit RescueERC20(token, to, amount);
    }

    /*
     *common Logic
     */
    /// @inheritdoc IParaApeStaking
    function poolTokenStatus(uint256 poolId, uint256 tokenId)
        external
        view
        returns (IParaApeStaking.TokenStatus memory)
    {
        return poolStates[poolId].tokenStatus[tokenId];
    }

    /// @inheritdoc IParaApeStaking
    function getPendingReward(uint256 poolId, uint32[] calldata tokenIds)
        external
        view
        returns (uint256)
    {
        return
            ApeCoinPoolLogic.getPendingReward(
                poolStates[poolId],
                cApe,
                tokenIds
            );
    }

    /// @inheritdoc IParaApeStaking
    function claimPendingReward(uint256 poolId, uint32[] calldata tokenIds)
        external
        whenNotPaused
        nonReentrant
    {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        address owner = ApeCoinPoolLogic.claimPendingReward(
            poolStates[poolId],
            vars,
            poolId,
            tokenIds
        );
        require(msg.sender == owner, Errors.CALLER_NOT_ALLOWED);
    }

    /*
     *sApe Logic
     */
    /// @inheritdoc IParaApeStaking
    function stakedSApeBalance(address user) external view returns (uint256) {
        return sApeBalance[user].stakedBalance;
    }

    /// @inheritdoc IParaApeStaking
    function freeSApeBalance(address user) external view returns (uint256) {
        uint256 freeShareBalance = sApeBalance[user].freeShareBalance;
        if (freeShareBalance == 0) {
            return 0;
        }
        return ICApe(cApe).getPooledApeByShares(freeShareBalance);
    }

    /// @inheritdoc IParaApeStaking
    function totalSApeBalance(address user) external view returns (uint256) {
        IParaApeStaking.SApeBalance memory cache = sApeBalance[user];
        uint256 freeShareBalance = cache.freeShareBalance;
        if (freeShareBalance == 0) {
            return cache.stakedBalance;
        }
        return
            ICApe(cApe).getPooledApeByShares(freeShareBalance) +
            cache.stakedBalance;
    }

    /// @inheritdoc IParaApeStaking
    function transferFreeSApeBalance(
        address from,
        address to,
        uint256 amount
    ) external {
        require(msg.sender == psApe, Errors.CALLER_NOT_ALLOWED);
        uint256 shareAmount = ICApe(cApe).getShareByPooledApe(amount);
        sApeBalance[from].freeShareBalance -= shareAmount.toUint128();
        sApeBalance[to].freeShareBalance += shareAmount.toUint128();
    }

    /// @inheritdoc IParaApeStaking
    function depositFreeSApe(address cashAsset, uint128 amount)
        external
        whenNotPaused
        nonReentrant
    {
        ApeCoinPoolLogic.depositFreeSApe(
            sApeBalance,
            apeCoin,
            cApe,
            msg.sender,
            cashAsset,
            amount
        );
    }

    /// @inheritdoc IParaApeStaking
    function withdrawFreeSApe(address receiveAsset, uint128 amount)
        external
        whenNotPaused
        nonReentrant
    {
        ApeCoinPoolLogic.withdrawFreeSApe(
            sApeBalance,
            pool,
            apeCoin,
            cApe,
            sApeReserveId,
            msg.sender,
            receiveAsset,
            amount
        );
    }

    /*
     *Ape Coin Staking Pool Logic
     */
    /// @inheritdoc IApeCoinPool
    function depositApeCoinPool(ApeCoinDepositInfo calldata depositInfo)
        external
        whenNotPaused
        nonReentrant
    {
        require(
            msg.sender == pool || msg.sender == depositInfo.onBehalf,
            Errors.CALLER_NOT_ALLOWED
        );
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        uint256 poolId = depositInfo.isBAYC
            ? ApeStakingCommonLogic.BAYC_APECOIN_POOL_ID
            : ApeStakingCommonLogic.MAYC_APECOIN_POOL_ID;
        ApeCoinPoolLogic.depositApeCoinPool(
            poolStates[poolId],
            apeMatchedCount,
            sApeBalance,
            vars,
            depositInfo
        );
    }

    /// @inheritdoc IApeCoinPool
    function compoundApeCoinPool(bool isBAYC, uint32[] calldata tokenIds)
        external
        onlyApeStakingBot
    {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.compoundFee = compoundFee;
        uint256 poolId = isBAYC
            ? ApeStakingCommonLogic.BAYC_APECOIN_POOL_ID
            : ApeStakingCommonLogic.MAYC_APECOIN_POOL_ID;
        ApeCoinPoolLogic.compoundApeCoinPool(
            poolStates[poolId],
            cApeShareBalance,
            vars,
            isBAYC,
            tokenIds
        );
    }

    /// @inheritdoc IApeCoinPool
    function withdrawApeCoinPool(ApeCoinWithdrawInfo calldata withdrawInfo)
        external
        whenNotPaused
        nonReentrant
    {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.compoundFee = compoundFee;
        vars.sApeReserveId = sApeReserveId;
        uint256 poolId = withdrawInfo.isBAYC
            ? ApeStakingCommonLogic.BAYC_APECOIN_POOL_ID
            : ApeStakingCommonLogic.MAYC_APECOIN_POOL_ID;
        ApeCoinPoolLogic.withdrawApeCoinPool(
            poolStates[poolId],
            apeMatchedCount,
            sApeBalance,
            cApeShareBalance,
            vars,
            withdrawInfo,
            poolId
        );
    }

    /// @inheritdoc IApeCoinPool
    function depositApeCoinPairPool(ApeCoinPairDepositInfo calldata depositInfo)
        external
        whenNotPaused
        nonReentrant
    {
        require(
            msg.sender == pool || msg.sender == depositInfo.onBehalf,
            Errors.CALLER_NOT_ALLOWED
        );
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        uint256 poolId = depositInfo.isBAYC
            ? ApeStakingCommonLogic.BAYC_BAKC_APECOIN_POOL_ID
            : ApeStakingCommonLogic.MAYC_BAKC_APECOIN_POOL_ID;
        ApeCoinPoolLogic.depositApeCoinPairPool(
            poolStates[poolId],
            apeMatchedCount,
            sApeBalance,
            vars,
            depositInfo
        );
    }

    /// @inheritdoc IApeCoinPool
    function compoundApeCoinPairPool(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external onlyApeStakingBot {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.compoundFee = compoundFee;
        uint256 poolId = isBAYC
            ? ApeStakingCommonLogic.BAYC_BAKC_APECOIN_POOL_ID
            : ApeStakingCommonLogic.MAYC_BAKC_APECOIN_POOL_ID;
        ApeCoinPoolLogic.compoundApeCoinPairPool(
            poolStates[poolId],
            cApeShareBalance,
            vars,
            isBAYC,
            apeTokenIds,
            bakcTokenIds
        );
    }

    /// @inheritdoc IApeCoinPool
    function withdrawApeCoinPairPool(
        ApeCoinPairWithdrawInfo calldata withdrawInfo
    ) external whenNotPaused nonReentrant {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.compoundFee = compoundFee;
        vars.sApeReserveId = sApeReserveId;
        uint256 poolId = withdrawInfo.isBAYC
            ? ApeStakingCommonLogic.BAYC_BAKC_APECOIN_POOL_ID
            : ApeStakingCommonLogic.MAYC_BAKC_APECOIN_POOL_ID;
        ApeCoinPoolLogic.withdrawApeCoinPairPool(
            poolStates[poolId],
            apeMatchedCount,
            sApeBalance,
            cApeShareBalance,
            vars,
            withdrawInfo,
            poolId
        );
    }

    /// @inheritdoc IApeCoinPool
    function nBakcOwnerChangeCallback(uint32[] calldata tokenIds)
        external
        whenNotPaused
        nonReentrant
    {
        require(msg.sender == nBakc, Errors.CALLER_NOT_ALLOWED);
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        uint256 poolId = ApeStakingCommonLogic.BAKC_SINGLE_POOL_ID;
        ApeStakingSinglePoolLogic.tryClaimNFT(
            poolStates[poolId],
            vars,
            poolId,
            bakc,
            tokenIds
        );
    }

    /// @inheritdoc IApeCoinPool
    function nApeOwnerChangeCallback(bool isBAYC, uint32[] calldata tokenIds)
        external
        whenNotPaused
        nonReentrant
    {
        require(
            msg.sender == nBayc || msg.sender == nMayc,
            Errors.CALLER_NOT_ALLOWED
        );
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.compoundFee = compoundFee;

        uint32[] memory apeCoinPoolTokenIds = new uint32[](tokenIds.length);
        uint256 apeCoinPoolCount = 0;
        //handle nft pool in the scope to avoid stack too deep
        {
            uint32[] memory pairPoolTokenIds = new uint32[](tokenIds.length);
            uint32[] memory singlePoolTokenIds = new uint32[](tokenIds.length);
            uint256 pairPoolCount = 0;
            uint256 singlePoolCount = 0;

            for (uint256 index = 0; index < tokenIds.length; index++) {
                uint32 tokenId = tokenIds[index];

                //check if ape in pair pool
                uint256 poolId = isBAYC
                    ? ApeStakingCommonLogic.BAYC_BAKC_PAIR_POOL_ID
                    : ApeStakingCommonLogic.MAYC_BAKC_PAIR_POOL_ID;
                TokenStatus memory tokenStatus = poolStates[poolId].tokenStatus[
                    tokenId
                ];
                if (tokenStatus.isInPool) {
                    pairPoolTokenIds[pairPoolCount] = tokenId;
                    pairPoolCount++;
                    continue;
                }

                //check if ape in single pool
                poolId = isBAYC
                    ? ApeStakingCommonLogic.BAYC_SINGLE_POOL_ID
                    : ApeStakingCommonLogic.MAYC_SINGLE_POOL_ID;
                if (poolStates[poolId].tokenStatus[tokenId].isInPool) {
                    singlePoolTokenIds[singlePoolCount] = tokenId;
                    singlePoolCount++;
                    continue;
                }

                //must be in ape coin pool
                apeCoinPoolTokenIds[apeCoinPoolCount] = tokenId;
                apeCoinPoolCount++;
            }

            if (pairPoolCount > 0) {
                assembly {
                    mstore(pairPoolTokenIds, pairPoolCount)
                }
                uint256 poolId = isBAYC
                    ? ApeStakingCommonLogic.BAYC_BAKC_PAIR_POOL_ID
                    : ApeStakingCommonLogic.MAYC_BAKC_PAIR_POOL_ID;
                ApeCoinPoolLogic.claimPendingReward(
                    poolStates[poolId],
                    vars,
                    poolId,
                    pairPoolTokenIds
                );
            }

            if (singlePoolCount > 0) {
                assembly {
                    mstore(singlePoolTokenIds, singlePoolCount)
                }
                uint256 poolId = isBAYC
                    ? ApeStakingCommonLogic.BAYC_SINGLE_POOL_ID
                    : ApeStakingCommonLogic.MAYC_SINGLE_POOL_ID;
                ApeCoinPoolLogic.claimPendingReward(
                    poolStates[poolId],
                    vars,
                    poolId,
                    singlePoolTokenIds
                );
            }
        }

        if (apeCoinPoolCount > 0) {
            assembly {
                mstore(apeCoinPoolTokenIds, apeCoinPoolCount)
            }

            ApeCoinPoolLogic.tryUnstakeApeCoinPoolPosition(
                poolStates,
                apeMatchedCount,
                sApeBalance,
                cApeShareBalance,
                vars,
                isBAYC,
                apeCoinPoolTokenIds
            );
        }
    }

    /*
     * P2P Pair Staking Logic
     */

    /// @inheritdoc IApeStakingP2P
    function cancelListing(ListingOrder calldata listingOrder)
        external
        override
        nonReentrant
    {
        bytes32 orderHash = ApeStakingP2PLogic.cancelListing(
            listingOrder,
            listingOrderStatus
        );

        emit OrderCancelled(orderHash, listingOrder.offerer);
    }

    /// @inheritdoc IApeStakingP2P
    function matchPairStakingList(
        ListingOrder calldata apeOrder,
        ListingOrder calldata apeCoinOrder
    ) external override nonReentrant whenNotPaused returns (bytes32 orderHash) {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.DOMAIN_SEPARATOR = DOMAIN_SEPARATOR;
        orderHash = ApeStakingP2PLogic.matchPairStakingList(
            apeOrder,
            apeCoinOrder,
            listingOrderStatus,
            matchedOrders,
            apeMatchedCount,
            sApeBalance,
            vars
        );

        emit PairStakingMatched(orderHash);

        return orderHash;
    }

    /// @inheritdoc IApeStakingP2P
    function matchBAKCPairStakingList(
        ListingOrder calldata apeOrder,
        ListingOrder calldata bakcOrder,
        ListingOrder calldata apeCoinOrder
    ) external override nonReentrant whenNotPaused returns (bytes32 orderHash) {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.DOMAIN_SEPARATOR = DOMAIN_SEPARATOR;
        orderHash = ApeStakingP2PLogic.matchBAKCPairStakingList(
            apeOrder,
            bakcOrder,
            apeCoinOrder,
            listingOrderStatus,
            matchedOrders,
            apeMatchedCount,
            sApeBalance,
            vars
        );

        emit PairStakingMatched(orderHash);

        return orderHash;
    }

    /// @inheritdoc IApeStakingP2P
    function breakUpMatchedOrder(bytes32 orderHash)
        external
        override
        nonReentrant
        whenNotPaused
    {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.compoundFee = compoundFee;
        vars.sApeReserveId = sApeReserveId;
        ApeStakingP2PLogic.breakUpMatchedOrder(
            listingOrderStatus,
            matchedOrders,
            cApeShareBalance,
            apeMatchedCount,
            sApeBalance,
            vars,
            orderHash
        );

        //7 emit event
        emit PairStakingBreakUp(orderHash);
    }

    /// @inheritdoc IApeStakingP2P
    function claimForMatchedOrderAndCompound(bytes32[] calldata orderHashes)
        external
        override
        nonReentrant
        whenNotPaused
    {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.compoundFee = compoundFee;
        ApeStakingP2PLogic.claimForMatchedOrdersAndCompound(
            matchedOrders,
            cApeShareBalance,
            vars,
            orderHashes
        );
    }

    /// @inheritdoc IApeStakingP2P
    function claimCApeReward(address receiver)
        external
        override
        nonReentrant
        whenNotPaused
    {
        uint256 cApeAmount = pendingCApeReward(msg.sender);
        if (cApeAmount > 0) {
            IERC20(cApe).safeTransfer(receiver, cApeAmount);
            delete cApeShareBalance[msg.sender];
            emit CApeClaimed(msg.sender, receiver, cApeAmount);
        }
    }

    /// @inheritdoc IApeStakingP2P
    function pendingCApeReward(address user)
        public
        view
        override
        returns (uint256)
    {
        uint256 amount = 0;
        uint256 shareBalance = cApeShareBalance[user];
        if (shareBalance > 0) {
            amount = ICApe(cApe).getPooledApeByShares(shareBalance);
        }
        return amount;
    }

    /// @inheritdoc IApeStakingP2P
    function getApeCoinStakingCap(StakingType stakingType)
        public
        view
        override
        returns (uint256)
    {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        return ApeStakingP2PLogic.getApeCoinStakingCap(stakingType, vars);
    }

    /*
     * Ape Staking Vault Logic
     */

    function setSinglePoolApeRewardRatio(uint32 apeRewardRatio)
        external
        onlyPoolAdmin
    {
        require(
            apeRewardRatio < PercentageMath.PERCENTAGE_FACTOR,
            Errors.INVALID_PARAMETER
        );
        uint32 oldValue = apePairStakingRewardRatio;
        if (oldValue != apeRewardRatio) {
            apePairStakingRewardRatio = apeRewardRatio;
            emit ApePairStakingRewardRatioUpdated(oldValue, apeRewardRatio);
        }
    }

    /// @inheritdoc IApeStakingVault
    function depositPairNFT(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external override whenNotPaused nonReentrant {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        uint256 poolId = isBAYC
            ? ApeStakingCommonLogic.BAYC_BAKC_PAIR_POOL_ID
            : ApeStakingCommonLogic.MAYC_BAKC_PAIR_POOL_ID;
        ApeStakingPairPoolLogic.depositPairNFT(
            poolStates[poolId],
            vars,
            isBAYC,
            apeTokenIds,
            bakcTokenIds
        );
    }

    /// @inheritdoc IApeStakingVault
    function stakingPairNFT(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external override whenNotPaused nonReentrant {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        uint256 poolId = isBAYC
            ? ApeStakingCommonLogic.BAYC_BAKC_PAIR_POOL_ID
            : ApeStakingCommonLogic.MAYC_BAKC_PAIR_POOL_ID;
        ApeStakingPairPoolLogic.stakingPairNFT(
            poolStates[poolId],
            vars,
            isBAYC,
            apeTokenIds,
            bakcTokenIds
        );
    }

    /// @inheritdoc IApeStakingVault
    function compoundPairNFT(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external override onlyApeStakingBot {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.compoundFee = compoundFee;
        uint256 poolId = isBAYC
            ? ApeStakingCommonLogic.BAYC_BAKC_PAIR_POOL_ID
            : ApeStakingCommonLogic.MAYC_BAKC_PAIR_POOL_ID;
        ApeStakingPairPoolLogic.compoundPairNFT(
            poolStates[poolId],
            cApeShareBalance,
            vars,
            isBAYC,
            apeTokenIds,
            bakcTokenIds
        );
    }

    /// @inheritdoc IApeStakingVault
    function withdrawPairNFT(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external override whenNotPaused nonReentrant {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.compoundFee = compoundFee;
        uint256 poolId = isBAYC
            ? ApeStakingCommonLogic.BAYC_BAKC_PAIR_POOL_ID
            : ApeStakingCommonLogic.MAYC_BAKC_PAIR_POOL_ID;
        ApeStakingPairPoolLogic.withdrawPairNFT(
            poolStates[poolId],
            cApeShareBalance,
            vars,
            isBAYC,
            apeTokenIds,
            bakcTokenIds
        );
    }

    /// @inheritdoc IApeStakingVault
    function depositNFT(address nft, uint32[] calldata tokenIds)
        external
        override
        whenNotPaused
        nonReentrant
    {
        require(
            nft == bayc || nft == mayc || nft == bakc,
            Errors.NFT_NOT_ALLOWED
        );
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        uint256 poolId = (nft == bayc)
            ? ApeStakingCommonLogic.BAYC_SINGLE_POOL_ID
            : (nft == mayc)
            ? ApeStakingCommonLogic.MAYC_SINGLE_POOL_ID
            : ApeStakingCommonLogic.BAKC_SINGLE_POOL_ID;
        ApeStakingSinglePoolLogic.depositNFT(
            poolStates[poolId],
            vars,
            nft,
            tokenIds
        );
    }

    /// @inheritdoc IApeStakingVault
    function stakingApe(bool isBAYC, uint32[] calldata tokenIds)
        external
        override
        whenNotPaused
        nonReentrant
    {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        uint256 poolId = isBAYC
            ? ApeStakingCommonLogic.BAYC_SINGLE_POOL_ID
            : ApeStakingCommonLogic.MAYC_SINGLE_POOL_ID;
        ApeStakingSinglePoolLogic.stakingApe(
            poolStates[poolId],
            vars,
            isBAYC,
            tokenIds
        );
    }

    /// @inheritdoc IApeStakingVault
    function stakingBAKC(BAKCPairActionInfo calldata actionInfo)
        external
        override
        whenNotPaused
        nonReentrant
    {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        ApeStakingSinglePoolLogic.stakingBAKC(poolStates, vars, actionInfo);
    }

    /// @inheritdoc IApeStakingVault
    function compoundApe(bool isBAYC, uint32[] calldata tokenIds)
        external
        override
        onlyApeStakingBot
    {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.compoundFee = compoundFee;
        uint256 poolId = isBAYC
            ? ApeStakingCommonLogic.BAYC_SINGLE_POOL_ID
            : ApeStakingCommonLogic.MAYC_SINGLE_POOL_ID;
        ApeStakingSinglePoolLogic.compoundApe(
            poolStates[poolId],
            cApeShareBalance,
            vars,
            isBAYC,
            tokenIds
        );
    }

    /// @inheritdoc IApeStakingVault
    function compoundBAKC(BAKCPairActionInfo calldata actionInfo)
        external
        override
        onlyApeStakingBot
    {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.compoundFee = compoundFee;
        vars.apeRewardRatio = apePairStakingRewardRatio;
        ApeStakingSinglePoolLogic.compoundBAKC(
            poolStates,
            cApeShareBalance,
            vars,
            actionInfo
        );
    }

    /// @inheritdoc IApeStakingVault
    function withdrawNFT(address nft, uint32[] calldata tokenIds)
        external
        override
        whenNotPaused
        nonReentrant
    {
        require(
            nft == bayc || nft == mayc || nft == bakc,
            Errors.NFT_NOT_ALLOWED
        );
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.compoundFee = compoundFee;
        vars.apeRewardRatio = apePairStakingRewardRatio;
        ApeStakingSinglePoolLogic.withdrawNFT(
            poolStates,
            cApeShareBalance,
            vars,
            nft,
            tokenIds
        );
    }

    function _createCacheVars()
        internal
        view
        returns (ApeStakingVaultCacheVars memory)
    {
        ApeStakingVaultCacheVars memory vars;
        vars.pool = pool;
        vars.bayc = bayc;
        vars.mayc = mayc;
        vars.bakc = bakc;
        vars.nBayc = nBayc;
        vars.nMayc = nMayc;
        vars.nBakc = nBakc;
        vars.apeCoin = apeCoin;
        vars.cApe = cApe;
        vars.apeCoinStaking = apeCoinStaking;
        vars.baycMatchedCap = baycMatchedCap;
        vars.maycMatchedCap = maycMatchedCap;
        vars.bakcMatchedCap = bakcMatchedCap;
        return vars;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
