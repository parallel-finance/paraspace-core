// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import "../interfaces/IParaApeStaking.sol";
import "../dependencies/openzeppelin/upgradeability/Initializable.sol";
import "../dependencies/openzeppelin/upgradeability/ReentrancyGuardUpgradeable.sol";
import "../dependencies/openzeppelin/upgradeability/PausableUpgradeable.sol";
import {IERC20, SafeERC20} from "../dependencies/openzeppelin/contracts/SafeERC20.sol";
import "../dependencies/openzeppelin/contracts/SafeCast.sol";
import "../dependencies/yoga-labs/ApeCoinStaking.sol";
import "../interfaces/IACLManager.sol";
import "../interfaces/ICApe.sol";
import {PercentageMath} from "../protocol/libraries/math/PercentageMath.sol";
import {WadRayMath} from "../protocol/libraries/math/WadRayMath.sol";
import "./logic/ApeStakingP2PLogic.sol";
import "./logic/ApeStakingVaultLogic.sol";
import "./logic/ApeStakingCommonLogic.sol";

contract ParaApeStaking is
    Initializable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    IParaApeStaking
{
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using PercentageMath for uint256;
    using WadRayMath for uint256;

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
    uint256 public immutable compoundFee;
    uint256 private immutable baycMatchedCap;
    uint256 private immutable maycMatchedCap;
    uint256 private immutable bakcMatchedCap;
    IACLManager private immutable aclManager;

    bytes32 internal DOMAIN_SEPARATOR;
    mapping(bytes32 => ListingOrderStatus) public listingOrderStatus;
    mapping(bytes32 => MatchedOrder) public matchedOrders;
    mapping(address => mapping(uint32 => uint256)) private apeMatchedCount;
    mapping(StakingType => mapping(uint32 => uint256))
        private positionCApeShareDebt;
    mapping(address => uint256) private cApeShareBalance;

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
        address _aclManager,
        uint256 _compoundFee
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
        compoundFee = _compoundFee;

        (
            ,
            ApeCoinStaking.PoolUI memory baycPool,
            ApeCoinStaking.PoolUI memory maycPool,
            ApeCoinStaking.PoolUI memory bakcPool
        ) = apeCoinStaking.getPoolsUI();

        baycMatchedCap = baycPool.currentTimeRange.capPerPosition;
        maycMatchedCap = maycPool.currentTimeRange.capPerPosition;
        bakcMatchedCap = bakcPool.currentTimeRange.capPerPosition;
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
    }

    function cancelListing(ListingOrder calldata listingOrder)
        external
        nonReentrant
    {
        require(msg.sender == listingOrder.offerer, "not order offerer");
        bytes32 orderHash = ApeStakingP2PLogic.getListingOrderHash(
            listingOrder
        );
        require(
            listingOrderStatus[orderHash] != ListingOrderStatus.Cancelled,
            "order already cancelled"
        );
        listingOrderStatus[orderHash] = ListingOrderStatus.Cancelled;

        emit OrderCancelled(orderHash, listingOrder.offerer);
    }

    function matchPairStakingList(
        ListingOrder calldata apeOrder,
        ListingOrder calldata apeCoinOrder
    ) external nonReentrant whenNotPaused returns (bytes32 orderHash) {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.DOMAIN_SEPARATOR = DOMAIN_SEPARATOR;
        orderHash = ApeStakingP2PLogic.matchPairStakingList(
            apeOrder,
            apeCoinOrder,
            listingOrderStatus,
            matchedOrders,
            apeMatchedCount,
            vars
        );

        emit PairStakingMatched(orderHash);

        return orderHash;
    }

    function matchBAKCPairStakingList(
        ListingOrder calldata apeOrder,
        ListingOrder calldata bakcOrder,
        ListingOrder calldata apeCoinOrder
    ) external nonReentrant whenNotPaused returns (bytes32 orderHash) {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        vars.DOMAIN_SEPARATOR = DOMAIN_SEPARATOR;
        orderHash = ApeStakingP2PLogic.matchPairStakingList(
            apeOrder,
            bakcOrder,
            apeCoinOrder,
            listingOrderStatus,
            matchedOrders,
            apeMatchedCount,
            vars
        );

        emit PairStakingMatched(orderHash);

        return orderHash;
    }

    function breakUpMatchedOrder(bytes32 orderHash)
        external
        nonReentrant
        whenNotPaused
    {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        ApeStakingP2PLogic.breakUpMatchedOrder(
            listingOrderStatus,
            matchedOrders,
            cApeShareBalance,
            apeMatchedCount,
            vars,
            orderHash
        );

        //7 emit event
        emit PairStakingBreakUp(orderHash);
    }

    function claimForMatchedOrderAndCompound(bytes32[] calldata orderHashes)
        external
        nonReentrant
        whenNotPaused
    {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        ApeStakingP2PLogic.claimForMatchedOrdersAndCompound(
            matchedOrders,
            cApeShareBalance,
            vars,
            orderHashes
        );
    }

    function claimCApeReward(address receiver)
        external
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

    function pendingCApeReward(address user) public view returns (uint256) {
        uint256 amount = 0;
        uint256 shareBalance = cApeShareBalance[user];
        if (shareBalance > 0) {
            amount = ICApe(cApe).getPooledApeByShares(shareBalance);
        }
        return amount;
    }

    function getApeCoinStakingCap(StakingType stakingType)
        public
        view
        returns (uint256)
    {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        return ApeStakingP2PLogic.getApeCoinStakingCap(stakingType, vars);
    }

    mapping(uint256 => PoolState) public poolStates;

    //address public vaultBot;

    function depositPairNFT(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        ApeStakingVaultLogic.depositPairNFT(
            poolStates,
            vars,
            isBAYC,
            apeTokenIds,
            bakcTokenIds
        );
    }

    function stakingPairNFT(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        ApeStakingVaultLogic.stakingPairNFT(
            poolStates,
            vars,
            isBAYC,
            apeTokenIds,
            bakcTokenIds
        );
    }

    function withdrawPairNFT(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        ApeStakingVaultLogic.withdrawPairNFT(
            poolStates,
            vars,
            isBAYC,
            apeTokenIds,
            bakcTokenIds
        );
    }

    // to save gas we don't claim pending reward in ApeCoinStaking.
    function claimPairNFT(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        ApeStakingVaultLogic.claimPairNFT(
            poolStates,
            vars,
            isBAYC,
            apeTokenIds,
            bakcTokenIds
        );
    }

    function compoundPairNFT(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external {
        ApeStakingVaultCacheVars memory vars = _createCacheVars();
        ApeStakingVaultLogic.compoundPairNFT(
            poolStates,
            vars,
            isBAYC,
            apeTokenIds,
            bakcTokenIds
        );
    }

    function depositBAYC(uint256[] calldata apeTokenIds) external {}

    function depositMAYC(uint256[] calldata apeTokenIds) external {}

    function depositBAKC(uint256[] calldata bakcTokenIds) external {}

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
        vars.compoundFee = compoundFee;
        vars.baycMatchedCap = baycMatchedCap;
        vars.maycMatchedCap = maycMatchedCap;
        vars.bakcMatchedCap = bakcMatchedCap;
        return vars;
    }
}
