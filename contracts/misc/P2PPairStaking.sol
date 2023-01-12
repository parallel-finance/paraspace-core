// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import "../dependencies/openzeppelin/upgradeability/Initializable.sol";
import "../dependencies/openzeppelin/upgradeability/OwnableUpgradeable.sol";
import "../dependencies/openzeppelin/upgradeability/ReentrancyGuardUpgradeable.sol";
import "../dependencies/yoga-labs/ApeCoinStaking.sol";
import "../interfaces/IP2PPairStaking.sol";
import "../dependencies/openzeppelin/contracts/SafeCast.sol";
import "../interfaces/IAutoCompoundApe.sol";
import "../interfaces/ICApe.sol";
import {IERC721} from "../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC20, SafeERC20} from "../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {PercentageMath} from "../protocol/libraries/math/PercentageMath.sol";
import {SignatureChecker} from "../dependencies/looksrare/contracts/libraries/SignatureChecker.sol";

contract P2PPairStaking is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    IP2PPairStaking
{
    using SafeERC20 for IERC20;
    using PercentageMath for uint256;
    using SafeCast for uint256;

    bytes32 public constant LISTING_ORDER_HASH =
        keccak256(
            "ListingOrder(uint8 stakingType,address offerer,address token,uint256 tokenId,uint256 share,uint256 startTime,uint256 endTime)"
        );
    bytes32 public constant MATCHED_ORDER_HASH =
        keccak256(
            "MatchedOrder(uint8 stakingType,address apeToken,address apeOfferer,uint32 apeTokenId,uint32 apeShare,address bakcOfferer,uint32 bakcTokenId,uint32 bakcShare,address apeCoinOfferer,uint32 apeCoinShare,uint256 apePrincipleAmount)"
        );
    bytes32 internal constant EIP712_DOMAIN =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    address public immutable bayc;
    address public immutable mayc;
    address public immutable bakc;
    address public immutable apeCoin;
    address public immutable cApe;
    ApeCoinStaking public immutable apeCoinStaking;

    bytes32 public DOMAIN_SEPARATOR;
    mapping(bytes32 => bool) public isListingOrderCanceled;
    mapping(bytes32 => MatchedOrder) public matchedOrders;
    mapping(address => uint256) public cApeShareBalance;
    address public matchingOperator;
    uint256 public compoundFee;

    constructor(
        address _bayc,
        address _mayc,
        address _bakc,
        address _apeCoin,
        address _cApe,
        address _apeCoinStaking
    ) {
        bayc = _bayc;
        mayc = _mayc;
        bakc = _bakc;
        apeCoin = _apeCoin;
        cApe = _cApe;
        apeCoinStaking = ApeCoinStaking(_apeCoinStaking);
    }

    function initialize() public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                EIP712_DOMAIN,
                keccak256("ParaSpace"),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );

        //approve for apeCoinStaking
        uint256 allowance = IERC20(apeCoin).allowance(
            address(this),
            address(apeCoinStaking)
        );
        if (allowance == 0) {
            IERC20(apeCoin).safeApprove(
                address(apeCoinStaking),
                type(uint256).max
            );
        }

        //approve for cApe
        allowance = IERC20(apeCoin).allowance(address(this), cApe);
        if (allowance == 0) {
            IERC20(apeCoin).safeApprove(cApe, type(uint256).max);
        }
    }

    function cancelListing(ListingOrder calldata listingOrder)
        external
        nonReentrant
    {
        require(msg.sender == listingOrder.offerer, "not order offerer");
        bytes32 orderHash = getListingOrderHash(listingOrder);
        require(!isListingOrderCanceled[orderHash], "order already cancel");
        isListingOrderCanceled[orderHash] = true;

        emit OrderCancelled(orderHash, listingOrder.offerer);
    }

    function matchPairStakingList(
        ListingOrder calldata apeOrder,
        ListingOrder calldata apeCoinOrder
    ) external nonReentrant returns (bytes32 orderHash) {
        //1 validate all order
        _validateApeOrder(apeOrder);
        _validateApeCoinOrder(apeCoinOrder);

        //2 check if orders can match
        require(
            apeOrder.stakingType <= StakingType.MAYCStaking,
            "invalid stake type"
        );
        require(
            apeOrder.stakingType == apeCoinOrder.stakingType,
            "orders type match failed"
        );
        require(
            apeOrder.share + apeCoinOrder.share ==
                PercentageMath.PERCENTAGE_FACTOR,
            "orders share match failed"
        );

        //3 transfer token
        IERC721(apeOrder.token).safeTransferFrom(
            apeOrder.offerer,
            address(this),
            apeOrder.tokenId
        );
        uint256 apeAmount = getApeCoinStakingCap(apeOrder.stakingType);
        IERC20(apeCoin).safeTransferFrom(
            apeCoinOrder.offerer,
            address(this),
            apeAmount
        );

        //4 create match order
        MatchedOrder memory matchedOrder = MatchedOrder({
            stakingType: apeOrder.stakingType,
            apeToken: apeOrder.token,
            apeOfferer: apeOrder.offerer,
            apeTokenId: apeOrder.tokenId,
            apeShare: apeOrder.share,
            bakcOfferer: address(0),
            bakcTokenId: 0,
            bakcShare: 0,
            apeCoinOfferer: apeCoinOrder.offerer,
            apeCoinShare: apeCoinOrder.share,
            apePrincipleAmount: apeAmount
        });
        orderHash = getMatchedOrderHash(matchedOrder);
        matchedOrders[orderHash] = matchedOrder;

        //5 stake for ApeCoinStaking
        ApeCoinStaking.SingleNft[]
            memory singleNft = new ApeCoinStaking.SingleNft[](1);
        singleNft[0].tokenId = apeOrder.tokenId;
        singleNft[0].amount = apeAmount.toUint224();
        if (apeOrder.stakingType == StakingType.BAYCStaking) {
            apeCoinStaking.depositBAYC(singleNft);
        } else {
            apeCoinStaking.depositMAYC(singleNft);
        }

        //5 emit event
        emit PairStakingMatched(orderHash);

        return orderHash;
    }

    function matchBAKCPairStakingList(
        ListingOrder calldata apeOrder,
        ListingOrder calldata bakcOrder,
        ListingOrder calldata apeCoinOrder
    ) external nonReentrant returns (bytes32 orderHash) {
        //1 validate all order
        _validateApeOrder(apeOrder);
        _validateBakcOrder(bakcOrder);
        _validateApeCoinOrder(apeCoinOrder);

        //2 check if orders can match
        require(
            apeOrder.stakingType >= StakingType.BAYCPairStaking,
            "invalid stake type"
        );
        require(
            apeOrder.stakingType == bakcOrder.stakingType &&
                apeOrder.stakingType == apeCoinOrder.stakingType,
            "orders type match failed"
        );
        require(
            apeOrder.share + bakcOrder.share + apeCoinOrder.share ==
                PercentageMath.PERCENTAGE_FACTOR,
            "share match failed"
        );

        //3 transfer token
        IERC721(apeOrder.token).safeTransferFrom(
            apeOrder.offerer,
            address(this),
            apeOrder.tokenId
        );
        IERC721(bakcOrder.token).safeTransferFrom(
            bakcOrder.offerer,
            address(this),
            bakcOrder.tokenId
        );
        uint256 apeAmount = getApeCoinStakingCap(apeOrder.stakingType);
        IERC20(apeCoin).safeTransferFrom(
            apeCoinOrder.offerer,
            address(this),
            apeAmount
        );

        //4 create match order
        MatchedOrder memory matchedOrder = MatchedOrder({
            stakingType: apeOrder.stakingType,
            apeToken: apeOrder.token,
            apeOfferer: apeOrder.offerer,
            apeTokenId: apeOrder.tokenId,
            apeShare: apeOrder.share,
            bakcOfferer: bakcOrder.offerer,
            bakcTokenId: bakcOrder.tokenId,
            bakcShare: bakcOrder.share,
            apeCoinOfferer: apeCoinOrder.offerer,
            apeCoinShare: apeCoinOrder.share,
            apePrincipleAmount: apeAmount
        });
        orderHash = getMatchedOrderHash(matchedOrder);
        matchedOrders[orderHash] = matchedOrder;

        //5 stake for ApeCoinStaking
        ApeCoinStaking.PairNftDepositWithAmount[]
            memory _stakingPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                1
            );
        _stakingPairs[0].mainTokenId = apeOrder.tokenId;
        _stakingPairs[0].bakcTokenId = bakcOrder.tokenId;
        _stakingPairs[0].amount = apeAmount.toUint184();
        ApeCoinStaking.PairNftDepositWithAmount[]
            memory _otherPairs = new ApeCoinStaking.PairNftDepositWithAmount[](
                0
            );
        if (apeOrder.stakingType == StakingType.BAYCPairStaking) {
            apeCoinStaking.depositBAKC(_stakingPairs, _otherPairs);
        } else {
            apeCoinStaking.depositBAKC(_otherPairs, _stakingPairs);
        }

        //5 emit event
        emit PairStakingMatched(orderHash);

        return orderHash;
    }

    function breakUpMatchedOrder(bytes32 orderHash) external nonReentrant {
        MatchedOrder memory order = matchedOrders[orderHash];

        //1 check owner
        require(
            msg.sender == matchingOperator ||
                msg.sender == order.apeOfferer ||
                msg.sender == order.bakcOfferer ||
                msg.sender == order.apeCoinOfferer,
            "no permission to break up"
        );

        //2 claim pending reward
        _claimForMatchedOrderAndCompound(orderHash);

        //3 delete matched order
        delete matchedOrders[orderHash];

        //4 exit from ApeCoinStaking
        if (order.stakingType < StakingType.BAYCPairStaking) {
            ApeCoinStaking.SingleNft[]
                memory _nfts = new ApeCoinStaking.SingleNft[](1);
            _nfts[0].tokenId = order.apeTokenId;
            _nfts[0].amount = order.apePrincipleAmount.toUint224();
            if (order.stakingType == StakingType.BAYCStaking) {
                apeCoinStaking.withdrawSelfBAYC(_nfts);
            } else {
                apeCoinStaking.withdrawSelfMAYC(_nfts);
            }
        } else {
            ApeCoinStaking.PairNftWithdrawWithAmount[]
                memory _nfts = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                    1
                );
            _nfts[0].mainTokenId = order.apeTokenId;
            _nfts[0].bakcTokenId = order.bakcTokenId;
            _nfts[0].amount = order.apePrincipleAmount.toUint184();
            _nfts[0].isUncommit = true;
            ApeCoinStaking.PairNftWithdrawWithAmount[]
                memory _otherPairs = new ApeCoinStaking.PairNftWithdrawWithAmount[](
                    0
                );
            if (order.stakingType == StakingType.BAYCPairStaking) {
                apeCoinStaking.withdrawBAKC(_nfts, _otherPairs);
            } else {
                apeCoinStaking.withdrawBAKC(_otherPairs, _nfts);
            }
        }
        //5 transfer token
        IERC721(order.apeToken).safeTransferFrom(
            address(this),
            order.apeOfferer,
            order.apeTokenId
        );
        IERC20(apeCoin).safeTransfer(
            order.apeCoinOfferer,
            order.apePrincipleAmount
        );
        if (order.stakingType >= StakingType.BAYCPairStaking) {
            IERC721(bakc).safeTransferFrom(
                address(this),
                order.bakcOfferer,
                order.bakcTokenId
            );
        }

        //5 emit event
        emit PairStakingBreakUp(orderHash);
    }

    function claimForMatchedOrderAndCompound(bytes32[] calldata orderHashes)
        external
        nonReentrant
    {
        for (uint256 index = 0; index < orderHashes.length; index++) {
            bytes32 orderHash = orderHashes[index];
            _claimForMatchedOrderAndCompound(orderHash);
        }
    }

    function claimCApeReward(address receiver) external nonReentrant {
        uint256 cApeAmount = pendingCApeReward(msg.sender);
        if (cApeAmount > 0) {
            IAutoCompoundApe(cApe).transfer(receiver, cApeAmount);
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
        (
            ,
            ApeCoinStaking.PoolUI memory baycPool,
            ApeCoinStaking.PoolUI memory maycPool,
            ApeCoinStaking.PoolUI memory bakcPool
        ) = apeCoinStaking.getPoolsUI();

        if (stakingType == StakingType.BAYCStaking) {
            return baycPool.currentTimeRange.capPerPosition;
        } else if (stakingType == StakingType.MAYCStaking) {
            return maycPool.currentTimeRange.capPerPosition;
        } else {
            return bakcPool.currentTimeRange.capPerPosition;
        }
    }

    function getListingOrderHash(ListingOrder calldata order)
        public
        pure
        returns (bytes32)
    {
        return
            keccak256(
                abi.encode(
                    LISTING_ORDER_HASH,
                    order.stakingType,
                    order.offerer,
                    order.token,
                    order.tokenId,
                    order.share,
                    order.startTime,
                    order.endTime
                )
            );
    }

    function getMatchedOrderHash(MatchedOrder memory order)
        public
        pure
        returns (bytes32)
    {
        return
            keccak256(
                abi.encode(
                    MATCHED_ORDER_HASH,
                    order.stakingType,
                    order.apeToken,
                    order.apeOfferer,
                    order.apeTokenId,
                    order.apeShare,
                    order.bakcOfferer,
                    order.bakcTokenId,
                    order.bakcShare,
                    order.apeCoinOfferer,
                    order.apeCoinShare,
                    order.apePrincipleAmount
                )
            );
    }

    function _claimForMatchedOrderAndCompound(bytes32 orderHash) internal {
        MatchedOrder memory order = matchedOrders[orderHash];
        uint256 balanceBefore = IERC20(apeCoin).balanceOf(address(this));
        if (order.stakingType < StakingType.BAYCPairStaking) {
            uint256[] memory _nfts = new uint256[](1);
            _nfts[0] = order.apeTokenId;
            if (order.stakingType == StakingType.BAYCStaking) {
                apeCoinStaking.claimSelfBAYC(_nfts);
            } else {
                apeCoinStaking.claimSelfMAYC(_nfts);
            }
        } else {
            ApeCoinStaking.PairNft[]
                memory _nfts = new ApeCoinStaking.PairNft[](1);
            _nfts[0].mainTokenId = order.apeTokenId;
            _nfts[0].bakcTokenId = order.bakcTokenId;
            ApeCoinStaking.PairNft[]
                memory _otherPairs = new ApeCoinStaking.PairNft[](0);
            if (order.stakingType == StakingType.BAYCPairStaking) {
                apeCoinStaking.claimSelfBAKC(_nfts, _otherPairs);
            } else {
                apeCoinStaking.claimSelfBAKC(_otherPairs, _nfts);
            }
        }
        uint256 balanceAfter = IERC20(apeCoin).balanceOf(address(this));
        uint256 rewardAmount = balanceAfter - balanceBefore;

        uint256 shareBefore = ICApe(cApe).sharesOf(address(this));
        IAutoCompoundApe(cApe).deposit(address(this), rewardAmount);
        uint256 shareAfter = ICApe(cApe).sharesOf(address(this));
        uint256 rewardShare = shareAfter - shareBefore;

        //compound fee
        uint256 _compoundFee = rewardShare.percentMul(compoundFee);
        _depositCApeShareForUser(address(this), _compoundFee);
        rewardShare -= _compoundFee;

        _depositCApeShareForUser(
            order.apeOfferer,
            rewardShare.percentMul(order.apeShare)
        );
        _depositCApeShareForUser(
            order.bakcOfferer,
            rewardShare.percentMul(order.bakcShare)
        );
        _depositCApeShareForUser(
            order.apeCoinOfferer,
            rewardShare.percentMul(order.apeCoinShare)
        );

        emit OrderClaimedAndCompounded(orderHash, rewardAmount);
    }

    function _depositCApeShareForUser(address user, uint256 amount) internal {
        if (amount > 0) {
            cApeShareBalance[user] += amount;
        }
    }

    function _validateOrderBasicInfo(ListingOrder calldata listingOrder)
        internal
        view
    {
        require(
            listingOrder.startTime <= block.timestamp,
            "ape order not start"
        );
        require(listingOrder.endTime >= block.timestamp, "ape offer expired");

        bytes32 orderHash = getListingOrderHash(listingOrder);
        require(!isListingOrderCanceled[orderHash], "order already canceled");

        if (
            msg.sender != listingOrder.offerer && msg.sender != matchingOperator
        ) {
            require(
                _validateOrderSignature(
                    listingOrder.offerer,
                    orderHash,
                    listingOrder.v,
                    listingOrder.r,
                    listingOrder.s
                ),
                "invalid signature"
            );
        }
    }

    function _validateApeOrder(ListingOrder calldata apeOrder) internal view {
        _validateOrderBasicInfo(apeOrder);

        address expectedToken = bayc;
        if (
            apeOrder.stakingType == StakingType.MAYCStaking ||
            apeOrder.stakingType == StakingType.MAYCPairStaking
        ) {
            expectedToken = mayc;
        }
        require(apeOrder.token == expectedToken, "ape order invalid token");
        require(
            IERC721(expectedToken).ownerOf(apeOrder.tokenId) ==
                apeOrder.offerer,
            "ape order invalid owner"
        );
    }

    function _validateBakcOrder(ListingOrder calldata bakcOrder) internal view {
        _validateOrderBasicInfo(bakcOrder);

        require(bakcOrder.token == bakc, "bakc order invalid token");
        require(
            IERC721(bakc).ownerOf(bakcOrder.tokenId) == bakcOrder.offerer,
            "bakc order invalid owner"
        );
    }

    function _validateApeCoinOrder(ListingOrder calldata apeCoinOrder)
        internal
        view
    {
        _validateOrderBasicInfo(apeCoinOrder);
        require(apeCoinOrder.token == apeCoin, "ape coin order invalid token");
    }

    function _validateOrderSignature(
        address signer,
        bytes32 orderHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view returns (bool) {
        return
            SignatureChecker.verify(
                orderHash,
                signer,
                v,
                r,
                s,
                DOMAIN_SEPARATOR
            );
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function setMatchingOperator(address _matchingOperator) external onlyOwner {
        require(_matchingOperator != address(0), "zero address");
        address oldOperator = matchingOperator;
        if (oldOperator != _matchingOperator) {
            matchingOperator = _matchingOperator;
            emit MatchingOperatorUpdated(oldOperator, _matchingOperator);
        }
    }

    function setCompoundFee(uint256 _compoundFee) external onlyOwner {
        require(
            _compoundFee < PercentageMath.HALF_PERCENTAGE_FACTOR,
            "Fee Too High"
        );
        uint256 oldValue = compoundFee;
        if (oldValue != _compoundFee) {
            compoundFee = _compoundFee;
            emit CompoundFeeUpdated(oldValue, _compoundFee);
        }
    }

    function claimCompoundFee(address receiver) external onlyOwner {
        this.claimCApeReward(receiver);
    }

    function rescueERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
        emit RescueERC20(token, to, amount);
    }
}
