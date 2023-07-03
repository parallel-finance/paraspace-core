// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import "../../interfaces/IApeStakingP2P.sol";
import "../../interfaces/IApeStakingP2P.sol";
import {IERC20, SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {PercentageMath} from "../../protocol/libraries/math/PercentageMath.sol";
import "../../interfaces/IAutoCompoundApe.sol";
import "../../interfaces/ICApe.sol";
import {SignatureChecker} from "../../dependencies/looksrare/contracts/libraries/SignatureChecker.sol";
import "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import "./ApeStakingCommonLogic.sol";
import {WadRayMath} from "../../protocol/libraries/math/WadRayMath.sol";

/**
 * @title ApeStakingVaultLogic library
 *
 * @notice Implements the base logic for ape staking vault
 */
library ApeStakingP2PLogic {
    using PercentageMath for uint256;
    using SafeCast for uint256;
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

    event OrderClaimedAndCompounded(bytes32 orderHash, uint256 totalReward);

    uint256 internal constant WAD = 1e18;

    //keccak256("ListingOrder(uint8 stakingType,address offerer,address token,uint256 tokenId,uint256 share,uint256 startTime,uint256 endTime)");
    bytes32 internal constant LISTING_ORDER_HASH =
        0x227f9dd14259caacdbcf45411b33cf1c018f31bd3da27e613a66edf8ae45814f;

    //keccak256("MatchedOrder(uint8 stakingType,address apeToken,uint32 apeTokenId,uint32 apeShare,uint32 bakcTokenId,uint32 bakcShare,address apeCoinOfferer,uint32 apeCoinShare,uint256 apePrincipleAmount)");
    bytes32 internal constant MATCHED_ORDER_HASH =
        0x7db3dae7d89c86e6881a66a131841305c008b207e41ff86a804b4bb056652808;

    function matchPairStakingList(
        IApeStakingP2P.ListingOrder calldata apeOrder,
        IApeStakingP2P.ListingOrder calldata apeCoinOrder,
        mapping(bytes32 => IApeStakingP2P.ListingOrderStatus)
            storage listingOrderStatus,
        mapping(bytes32 => IApeStakingP2P.MatchedOrder) storage matchedOrders,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars
    ) external returns (bytes32 orderHash) {
        //1 validate all order
        _validateApeOrder(listingOrderStatus, apeOrder, vars);
        bytes32 apeCoinListingOrderHash = _validateApeCoinOrder(
            listingOrderStatus,
            apeCoinOrder,
            vars
        );

        //2 check if orders can match
        require(
            apeOrder.stakingType == IApeStakingP2P.StakingType.MAYCStaking ||
                apeOrder.stakingType == IApeStakingP2P.StakingType.BAYCStaking,
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
        _handleApeTransfer(apeOrder, vars);
        uint256 apeAmount = _handleCApeTransferAndConvert(apeCoinOrder, vars);

        //4 create match order
        IApeStakingP2P.MatchedOrder memory matchedOrder = IApeStakingP2P
            .MatchedOrder({
                stakingType: apeOrder.stakingType,
                apeToken: apeOrder.token,
                apeTokenId: apeOrder.tokenId,
                apeShare: apeOrder.share,
                bakcTokenId: 0,
                bakcShare: 0,
                apeCoinOfferer: apeCoinOrder.offerer,
                apeCoinShare: apeCoinOrder.share,
                apePrincipleAmount: apeAmount,
                apeCoinListingOrderHash: apeCoinListingOrderHash
            });
        orderHash = getMatchedOrderHash(matchedOrder);
        matchedOrders[orderHash] = matchedOrder;
        apeMatchedCount[apeOrder.token][apeOrder.tokenId] += 1;

        //5 stake for ApeCoinStaking
        ApeCoinStaking.SingleNft[]
            memory singleNft = new ApeCoinStaking.SingleNft[](1);
        singleNft[0].tokenId = apeOrder.tokenId;
        singleNft[0].amount = apeAmount.toUint224();
        if (apeOrder.stakingType == IApeStakingP2P.StakingType.BAYCStaking) {
            vars.apeCoinStaking.depositBAYC(singleNft);
        } else {
            vars.apeCoinStaking.depositMAYC(singleNft);
        }

        //6 update ape coin listing order status
        listingOrderStatus[apeCoinListingOrderHash] = IApeStakingP2P
            .ListingOrderStatus
            .Matched;

        return orderHash;
    }

    function matchPairStakingList(
        IApeStakingP2P.ListingOrder calldata apeOrder,
        IApeStakingP2P.ListingOrder calldata bakcOrder,
        IApeStakingP2P.ListingOrder calldata apeCoinOrder,
        mapping(bytes32 => IApeStakingP2P.ListingOrderStatus)
            storage listingOrderStatus,
        mapping(bytes32 => IApeStakingP2P.MatchedOrder) storage matchedOrders,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars
    ) external returns (bytes32 orderHash) {
        //1 validate all order
        _validateApeOrder(listingOrderStatus, apeOrder, vars);
        _validateBakcOrder(listingOrderStatus, bakcOrder, vars);
        bytes32 apeCoinListingOrderHash = _validateApeCoinOrder(
            listingOrderStatus,
            apeCoinOrder,
            vars
        );

        //2 check if orders can match
        require(
            apeOrder.stakingType ==
                IApeStakingP2P.StakingType.BAYCPairStaking ||
                apeOrder.stakingType ==
                IApeStakingP2P.StakingType.MAYCPairStaking,
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
        _handleApeTransfer(apeOrder, vars);
        IERC721(vars.bakc).safeTransferFrom(
            vars.nBakc,
            address(this),
            bakcOrder.tokenId
        );
        uint256 apeAmount = _handleCApeTransferAndConvert(apeCoinOrder, vars);

        //4 create match order
        IApeStakingP2P.MatchedOrder memory matchedOrder = IApeStakingP2P
            .MatchedOrder({
                stakingType: apeOrder.stakingType,
                apeToken: apeOrder.token,
                apeTokenId: apeOrder.tokenId,
                apeShare: apeOrder.share,
                bakcTokenId: bakcOrder.tokenId,
                bakcShare: bakcOrder.share,
                apeCoinOfferer: apeCoinOrder.offerer,
                apeCoinShare: apeCoinOrder.share,
                apePrincipleAmount: apeAmount,
                apeCoinListingOrderHash: apeCoinListingOrderHash
            });
        orderHash = getMatchedOrderHash(matchedOrder);
        matchedOrders[orderHash] = matchedOrder;
        apeMatchedCount[apeOrder.token][apeOrder.tokenId] += 1;

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
        if (apeOrder.token == vars.bayc) {
            vars.apeCoinStaking.depositBAKC(_stakingPairs, _otherPairs);
        } else {
            vars.apeCoinStaking.depositBAKC(_otherPairs, _stakingPairs);
        }

        //6 update ape coin listing order status
        listingOrderStatus[apeCoinListingOrderHash] = IApeStakingP2P
            .ListingOrderStatus
            .Matched;

        return orderHash;
    }

    function breakUpMatchedOrder(
        mapping(bytes32 => IApeStakingP2P.ListingOrderStatus)
            storage listingOrderStatus,
        mapping(bytes32 => IApeStakingP2P.MatchedOrder) storage matchedOrders,
        mapping(address => uint256) storage cApeShareBalance,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bytes32 orderHash
    ) external {
        IApeStakingP2P.MatchedOrder memory order = matchedOrders[orderHash];

        //1 check if have permission to break up
        address apeNToken = _getApeNTokenAddress(vars, order.apeToken);
        address apeNTokenOwner = IERC721(apeNToken).ownerOf(order.apeTokenId);
        address nBakcOwner = IERC721(vars.nBakc).ownerOf(order.bakcTokenId);
        require(
            msg.sender == apeNTokenOwner ||
                msg.sender == order.apeCoinOfferer ||
                (msg.sender == nBakcOwner &&
                    (order.stakingType ==
                        IApeStakingP2P.StakingType.BAYCPairStaking ||
                        order.stakingType ==
                        IApeStakingP2P.StakingType.MAYCPairStaking)),
            "no permission to break up"
        );

        //2 claim pending reward and compound
        bytes32[] memory orderHashes = new bytes32[](1);
        orderHashes[0] = orderHash;
        claimForMatchedOrdersAndCompound(
            matchedOrders,
            cApeShareBalance,
            vars,
            orderHashes
        );

        //3 delete matched order
        delete matchedOrders[orderHash];

        //4 exit from ApeCoinStaking
        if (
            order.stakingType == IApeStakingP2P.StakingType.BAYCStaking ||
            order.stakingType == IApeStakingP2P.StakingType.MAYCStaking
        ) {
            ApeCoinStaking.SingleNft[]
                memory _nfts = new ApeCoinStaking.SingleNft[](1);
            _nfts[0].tokenId = order.apeTokenId;
            _nfts[0].amount = order.apePrincipleAmount.toUint224();
            if (order.stakingType == IApeStakingP2P.StakingType.BAYCStaking) {
                vars.apeCoinStaking.withdrawSelfBAYC(_nfts);
            } else {
                vars.apeCoinStaking.withdrawSelfMAYC(_nfts);
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
            if (order.apeToken == vars.bayc) {
                vars.apeCoinStaking.withdrawBAKC(_nfts, _otherPairs);
            } else {
                vars.apeCoinStaking.withdrawBAKC(_otherPairs, _nfts);
            }
        }
        //5 transfer token
        uint256 matchedCount = apeMatchedCount[order.apeToken][
            order.apeTokenId
        ];
        if (matchedCount == 1) {
            IERC721(order.apeToken).safeTransferFrom(
                address(this),
                apeNToken,
                order.apeTokenId
            );
        }
        apeMatchedCount[order.apeToken][order.apeTokenId] = matchedCount - 1;

        IAutoCompoundApe(vars.cApe).deposit(
            order.apeCoinOfferer,
            order.apePrincipleAmount
        );
        if (
            order.stakingType == IApeStakingP2P.StakingType.BAYCPairStaking ||
            order.stakingType == IApeStakingP2P.StakingType.MAYCPairStaking
        ) {
            IERC721(vars.bakc).safeTransferFrom(
                address(this),
                vars.nBakc,
                order.bakcTokenId
            );
        }

        //6 reset ape coin listing order status
        if (
            listingOrderStatus[order.apeCoinListingOrderHash] !=
            IApeStakingP2P.ListingOrderStatus.Cancelled
        ) {
            listingOrderStatus[order.apeCoinListingOrderHash] = IApeStakingP2P
                .ListingOrderStatus
                .Pending;
        }
    }

    function claimForMatchedOrdersAndCompound(
        mapping(bytes32 => IApeStakingP2P.MatchedOrder) storage matchedOrders,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bytes32[] memory orderHashes
    ) public {
        //ignore getShareByPooledApe return 0 case.
        uint256 cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(WAD);
        uint256 totalReward;
        uint256 totalFeeShare;
        uint256 orderCounts = orderHashes.length;
        for (uint256 index = 0; index < orderCounts; index++) {
            bytes32 orderHash = orderHashes[index];
            (
                uint256 reward,
                uint256 feeShare
            ) = _claimForMatchedOrderAndCompound(
                    matchedOrders,
                    cApeShareBalance,
                    vars,
                    orderHash,
                    cApeExchangeRate
                );
            totalReward += reward;
            totalFeeShare += feeShare;
        }
        if (totalReward > 0) {
            IAutoCompoundApe(vars.cApe).deposit(address(this), totalReward);
            ApeStakingCommonLogic.depositCApeShareForUser(
                cApeShareBalance,
                address(this),
                totalFeeShare
            );
        }
    }

    function getApeCoinStakingCap(
        IApeStakingP2P.StakingType stakingType,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars
    ) internal pure returns (uint256) {
        if (stakingType == IApeStakingP2P.StakingType.BAYCStaking) {
            return vars.baycMatchedCap;
        } else if (stakingType == IApeStakingP2P.StakingType.MAYCStaking) {
            return vars.maycMatchedCap;
        } else {
            return vars.bakcMatchedCap;
        }
    }

    function _claimForMatchedOrderAndCompound(
        mapping(bytes32 => IApeStakingP2P.MatchedOrder) storage matchedOrders,
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bytes32 orderHash,
        uint256 cApeExchangeRate
    ) internal returns (uint256, uint256) {
        IApeStakingP2P.MatchedOrder memory order = matchedOrders[orderHash];
        uint256 balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
        if (
            order.stakingType == IApeStakingP2P.StakingType.BAYCStaking ||
            order.stakingType == IApeStakingP2P.StakingType.MAYCStaking
        ) {
            uint256[] memory _nfts = new uint256[](1);
            _nfts[0] = order.apeTokenId;
            if (order.stakingType == IApeStakingP2P.StakingType.BAYCStaking) {
                vars.apeCoinStaking.claimSelfBAYC(_nfts);
            } else {
                vars.apeCoinStaking.claimSelfMAYC(_nfts);
            }
        } else {
            ApeCoinStaking.PairNft[]
                memory _nfts = new ApeCoinStaking.PairNft[](1);
            _nfts[0].mainTokenId = order.apeTokenId;
            _nfts[0].bakcTokenId = order.bakcTokenId;
            ApeCoinStaking.PairNft[]
                memory _otherPairs = new ApeCoinStaking.PairNft[](0);
            if (order.apeToken == vars.bayc) {
                vars.apeCoinStaking.claimSelfBAKC(_nfts, _otherPairs);
            } else {
                vars.apeCoinStaking.claimSelfBAKC(_otherPairs, _nfts);
            }
        }
        uint256 balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
        uint256 rewardAmount = balanceAfter - balanceBefore;
        if (rewardAmount == 0) {
            return (0, 0);
        }

        uint256 rewardShare = rewardAmount.wadDiv(cApeExchangeRate);
        //compound fee
        uint256 _compoundFeeShare = rewardShare.percentMul(vars.compoundFee);
        rewardShare -= _compoundFeeShare;

        ApeStakingCommonLogic.depositCApeShareForUser(
            cApeShareBalance,
            IERC721(_getApeNTokenAddress(vars, order.apeToken)).ownerOf(
                order.apeTokenId
            ),
            rewardShare.percentMul(order.apeShare)
        );
        ApeStakingCommonLogic.depositCApeShareForUser(
            cApeShareBalance,
            order.apeCoinOfferer,
            rewardShare.percentMul(order.apeCoinShare)
        );
        if (
            order.stakingType == IApeStakingP2P.StakingType.BAYCPairStaking ||
            order.stakingType == IApeStakingP2P.StakingType.MAYCPairStaking
        ) {
            ApeStakingCommonLogic.depositCApeShareForUser(
                cApeShareBalance,
                IERC721(vars.nBakc).ownerOf(order.bakcTokenId),
                rewardShare.percentMul(order.bakcShare)
            );
        }

        emit OrderClaimedAndCompounded(orderHash, rewardAmount);

        return (rewardAmount, _compoundFeeShare);
    }

    function _validateOrderBasicInfo(
        bytes32 DOMAIN_SEPARATOR,
        mapping(bytes32 => IApeStakingP2P.ListingOrderStatus)
            storage listingOrderStatus,
        IApeStakingP2P.ListingOrder calldata listingOrder
    ) internal view returns (bytes32 orderHash) {
        require(
            listingOrder.startTime <= block.timestamp,
            "ape order not start"
        );
        require(listingOrder.endTime >= block.timestamp, "ape offer expired");

        orderHash = getListingOrderHash(listingOrder);
        require(
            listingOrderStatus[orderHash] !=
                IApeStakingP2P.ListingOrderStatus.Cancelled,
            "order already cancelled"
        );

        if (msg.sender != listingOrder.offerer) {
            require(
                validateOrderSignature(
                    DOMAIN_SEPARATOR,
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

    function _validateApeOrder(
        mapping(bytes32 => IApeStakingP2P.ListingOrderStatus)
            storage listingOrderStatus,
        IApeStakingP2P.ListingOrder calldata apeOrder,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars
    ) internal view {
        _validateOrderBasicInfo(
            vars.DOMAIN_SEPARATOR,
            listingOrderStatus,
            apeOrder
        );

        address nToken = _getApeNTokenAddress(vars, apeOrder.token);
        require(
            IERC721(nToken).ownerOf(apeOrder.tokenId) == apeOrder.offerer,
            "ape order invalid NToken owner"
        );
    }

    function _validateApeCoinOrder(
        mapping(bytes32 => IApeStakingP2P.ListingOrderStatus)
            storage listingOrderStatus,
        IApeStakingP2P.ListingOrder calldata apeCoinOrder,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars
    ) internal view returns (bytes32 orderHash) {
        orderHash = _validateOrderBasicInfo(
            vars.DOMAIN_SEPARATOR,
            listingOrderStatus,
            apeCoinOrder
        );
        require(
            apeCoinOrder.token == vars.cApe,
            "ape coin order invalid token"
        );
        require(
            listingOrderStatus[orderHash] !=
                IApeStakingP2P.ListingOrderStatus.Matched,
            "ape coin order already matched"
        );
    }

    function _validateBakcOrder(
        mapping(bytes32 => IApeStakingP2P.ListingOrderStatus)
            storage listingOrderStatus,
        IApeStakingP2P.ListingOrder calldata bakcOrder,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars
    ) internal view {
        _validateOrderBasicInfo(
            vars.DOMAIN_SEPARATOR,
            listingOrderStatus,
            bakcOrder
        );

        require(bakcOrder.token == vars.bakc, "bakc order invalid token");
        require(
            IERC721(vars.nBakc).ownerOf(bakcOrder.tokenId) == bakcOrder.offerer,
            "bakc order invalid NToken owner"
        );
    }

    function _handleApeTransfer(
        IApeStakingP2P.ListingOrder calldata order,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars
    ) internal {
        address currentOwner = IERC721(order.token).ownerOf(order.tokenId);
        if (currentOwner != address(this)) {
            address nTokenAddress = _getApeNTokenAddress(vars, order.token);
            IERC721(order.token).safeTransferFrom(
                nTokenAddress,
                address(this),
                order.tokenId
            );
        }
    }

    function _handleCApeTransferAndConvert(
        IApeStakingP2P.ListingOrder calldata apeCoinOrder,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars
    ) internal returns (uint256) {
        uint256 apeAmount = getApeCoinStakingCap(
            apeCoinOrder.stakingType,
            vars
        );
        IERC20(vars.cApe).safeTransferFrom(
            apeCoinOrder.offerer,
            address(this),
            apeAmount
        );
        IAutoCompoundApe(vars.cApe).withdraw(apeAmount);
        return apeAmount;
    }

    function _getApeNTokenAddress(
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        address apeToken
    ) internal pure returns (address) {
        if (apeToken == vars.bayc) {
            return vars.nBayc;
        } else if (apeToken == vars.mayc) {
            return vars.nMayc;
        } else {
            revert("unsupported ape token");
        }
    }

    function getMatchedOrderHash(IApeStakingP2P.MatchedOrder memory order)
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
                    order.apeTokenId,
                    order.apeShare,
                    order.bakcTokenId,
                    order.bakcShare,
                    order.apeCoinOfferer,
                    order.apeCoinShare,
                    order.apePrincipleAmount
                )
            );
    }

    function getListingOrderHash(IApeStakingP2P.ListingOrder calldata order)
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

    function validateOrderSignature(
        bytes32 DOMAIN_SEPARATOR,
        address signer,
        bytes32 orderHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public view returns (bool) {
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
}
