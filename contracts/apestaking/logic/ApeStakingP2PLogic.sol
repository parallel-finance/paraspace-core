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
import "../../protocol/libraries/helpers/Errors.sol";
import {UserConfiguration} from "../../protocol/libraries/configuration/UserConfiguration.sol";
import {DataTypes} from "../../protocol/libraries/types/DataTypes.sol";

/**
 * @title ApeStakingVaultLogic library
 *
 * @notice Implements the base logic for ape staking vault
 */
library ApeStakingP2PLogic {
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using PercentageMath for uint256;
    using SafeCast for uint256;
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

    event OrderClaimedAndCompounded(bytes32 orderHash, uint256 totalReward);

    uint256 internal constant WAD = 1e18;

    //keccak256("ListingOrder(uint8 stakingType,address offerer,address token,uint256 tokenId,uint256 share,uint256 startTime,uint256 endTime)");
    bytes32 internal constant LISTING_ORDER_HASH =
        0x227f9dd14259caacdbcf45411b33cf1c018f31bd3da27e613a66edf8ae45814f;

    //keccak256("MatchedOrder(uint8 stakingType,address apeToken,uint32 apeTokenId,uint32 apeShare,uint32 bakcTokenId,uint32 bakcShare,address apeCoinOfferer,uint32 apeCoinShare)");
    bytes32 internal constant MATCHED_ORDER_HASH =
        0x48f3bc7b1131aafcb847892fa3593862086dbde63aca2af4deccea8f6e8a380e;

    function cancelListing(
        IApeStakingP2P.ListingOrder calldata listingOrder,
        mapping(bytes32 => IApeStakingP2P.ListingOrderStatus)
            storage listingOrderStatus
    ) external returns (bytes32) {
        require(msg.sender == listingOrder.offerer, Errors.NOT_ORDER_OFFERER);

        bytes32 orderHash = getListingOrderHash(listingOrder);
        require(
            listingOrderStatus[orderHash] !=
                IApeStakingP2P.ListingOrderStatus.Cancelled,
            Errors.ORDER_ALREADY_CANCELLED
        );
        listingOrderStatus[orderHash] = IApeStakingP2P
            .ListingOrderStatus
            .Cancelled;
        return orderHash;
    }

    function matchPairStakingList(
        IApeStakingP2P.ListingOrder calldata apeOrder,
        IApeStakingP2P.ListingOrder calldata apeCoinOrder,
        mapping(bytes32 => IApeStakingP2P.ListingOrderStatus)
            storage listingOrderStatus,
        mapping(bytes32 => IApeStakingP2P.MatchedOrder) storage matchedOrders,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
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
            Errors.INVALID_STAKING_TYPE
        );
        require(
            apeOrder.stakingType == apeCoinOrder.stakingType,
            Errors.ORDER_TYPE_MATCH_FAILED
        );
        require(
            apeOrder.share + apeCoinOrder.share ==
                PercentageMath.PERCENTAGE_FACTOR,
            Errors.ORDER_SHARE_MATCH_FAILED
        );

        //3 transfer token
        address nTokenAddress = _getApeNTokenAddress(vars, apeOrder.token);
        ApeStakingCommonLogic.handleApeTransferIn(
            apeMatchedCount,
            apeOrder.token,
            nTokenAddress,
            apeOrder.tokenId
        );
        uint256 apeCoinCap = getApeCoinStakingCap(
            apeCoinOrder.stakingType,
            vars
        );
        _prepareApeCoin(
            sApeBalance,
            vars.cApe,
            apeCoinOrder.offerer,
            apeCoinCap
        );

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
                apeCoinListingOrderHash: apeCoinListingOrderHash
            });
        orderHash = getMatchedOrderHash(matchedOrder);
        matchedOrders[orderHash] = matchedOrder;

        //5 stake for ApeCoinStaking
        ApeCoinStaking.SingleNft[]
            memory singleNft = new ApeCoinStaking.SingleNft[](1);
        singleNft[0].tokenId = apeOrder.tokenId;
        singleNft[0].amount = apeCoinCap.toUint224();
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

    function matchBAKCPairStakingList(
        IApeStakingP2P.ListingOrder calldata apeOrder,
        IApeStakingP2P.ListingOrder calldata bakcOrder,
        IApeStakingP2P.ListingOrder calldata apeCoinOrder,
        mapping(bytes32 => IApeStakingP2P.ListingOrderStatus)
            storage listingOrderStatus,
        mapping(bytes32 => IApeStakingP2P.MatchedOrder) storage matchedOrders,
        mapping(address => mapping(uint32 => uint256)) storage apeMatchedCount,
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
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
            apeOrder.stakingType == IApeStakingP2P.StakingType.BAKCPairStaking,
            Errors.INVALID_STAKING_TYPE
        );
        require(
            apeOrder.stakingType == bakcOrder.stakingType &&
                apeOrder.stakingType == apeCoinOrder.stakingType,
            Errors.ORDER_TYPE_MATCH_FAILED
        );
        require(
            apeOrder.share + bakcOrder.share + apeCoinOrder.share ==
                PercentageMath.PERCENTAGE_FACTOR,
            Errors.ORDER_SHARE_MATCH_FAILED
        );

        //3 transfer token
        address nTokenAddress = _getApeNTokenAddress(vars, apeOrder.token);
        ApeStakingCommonLogic.handleApeTransferIn(
            apeMatchedCount,
            apeOrder.token,
            nTokenAddress,
            apeOrder.tokenId
        );
        IERC721(vars.bakc).safeTransferFrom(
            vars.nBakc,
            address(this),
            bakcOrder.tokenId
        );
        uint256 apeCoinCap = getApeCoinStakingCap(
            apeCoinOrder.stakingType,
            vars
        );
        _prepareApeCoin(
            sApeBalance,
            vars.cApe,
            apeCoinOrder.offerer,
            apeCoinCap
        );

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
                apeCoinListingOrderHash: apeCoinListingOrderHash
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
        _stakingPairs[0].amount = apeCoinCap.toUint184();
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
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        bytes32 orderHash
    ) external {
        IApeStakingP2P.MatchedOrder memory order = matchedOrders[orderHash];

        //1 check if have permission to break up
        address apeNToken = _getApeNTokenAddress(vars, order.apeToken);
        require(
            msg.sender == order.apeCoinOfferer ||
                msg.sender == IERC721(apeNToken).ownerOf(order.apeTokenId) ||
                (order.stakingType ==
                    IApeStakingP2P.StakingType.BAKCPairStaking &&
                    msg.sender ==
                    IERC721(vars.nBakc).ownerOf(order.bakcTokenId)) ||
                _ifCanLiquidateApeCoinOffererSApe(
                    vars.pool,
                    vars.sApeReserveId,
                    order.apeCoinOfferer
                ),
            Errors.NO_BREAK_UP_PERMISSION
        );

        //2 exit from ApeCoinStaking
        uint256 apeCoinCap = getApeCoinStakingCap(order.stakingType, vars);
        uint256 balanceBefore = IERC20(vars.apeCoin).balanceOf(address(this));
        if (
            order.stakingType == IApeStakingP2P.StakingType.BAYCStaking ||
            order.stakingType == IApeStakingP2P.StakingType.MAYCStaking
        ) {
            ApeCoinStaking.SingleNft[]
                memory _nfts = new ApeCoinStaking.SingleNft[](1);
            _nfts[0].tokenId = order.apeTokenId;
            _nfts[0].amount = apeCoinCap.toUint224();
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
            _nfts[0].amount = apeCoinCap.toUint184();
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
        uint256 balanceAfter = IERC20(vars.apeCoin).balanceOf(address(this));
        uint256 withdrawAmount = balanceAfter - balanceBefore;

        vars.cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
        if (withdrawAmount > apeCoinCap) {
            uint256 _compoundFeeShare = _distributeReward(
                cApeShareBalance,
                vars,
                order,
                vars.cApeExchangeRate,
                withdrawAmount - apeCoinCap
            );
            ApeStakingCommonLogic.depositCApeShareForUser(
                cApeShareBalance,
                address(this),
                _compoundFeeShare
            );
        }

        //3 transfer token
        ApeStakingCommonLogic.handleApeTransferOut(
            apeMatchedCount,
            order.apeToken,
            apeNToken,
            order.apeTokenId
        );
        _updateUserSApeBalance(
            sApeBalance,
            order.apeCoinOfferer,
            apeCoinCap,
            vars.cApeExchangeRate
        );
        IAutoCompoundApe(vars.cApe).deposit(address(this), withdrawAmount);

        if (order.stakingType == IApeStakingP2P.StakingType.BAKCPairStaking) {
            IERC721(vars.bakc).safeTransferFrom(
                address(this),
                vars.nBakc,
                order.bakcTokenId
            );
        }

        //4 delete matched order
        delete matchedOrders[orderHash];

        //5 reset ape coin listing order status
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
        uint256 cApeExchangeRate = ICApe(vars.cApe).getPooledApeByShares(
            WadRayMath.RAY
        );
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

        uint256 _compoundFeeShare = _distributeReward(
            cApeShareBalance,
            vars,
            order,
            cApeExchangeRate,
            rewardAmount
        );

        emit OrderClaimedAndCompounded(orderHash, rewardAmount);

        return (rewardAmount, _compoundFeeShare);
    }

    function _distributeReward(
        mapping(address => uint256) storage cApeShareBalance,
        IParaApeStaking.ApeStakingVaultCacheVars memory vars,
        IApeStakingP2P.MatchedOrder memory order,
        uint256 cApeExchangeRate,
        uint256 rewardAmount
    ) internal returns (uint256) {
        uint256 rewardShare = rewardAmount.rayDiv(cApeExchangeRate);
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
        if (order.stakingType == IApeStakingP2P.StakingType.BAKCPairStaking) {
            ApeStakingCommonLogic.depositCApeShareForUser(
                cApeShareBalance,
                IERC721(vars.nBakc).ownerOf(order.bakcTokenId),
                rewardShare.percentMul(order.bakcShare)
            );
        }

        return _compoundFeeShare;
    }

    function _validateOrderBasicInfo(
        bytes32 DOMAIN_SEPARATOR,
        mapping(bytes32 => IApeStakingP2P.ListingOrderStatus)
            storage listingOrderStatus,
        IApeStakingP2P.ListingOrder calldata listingOrder
    ) internal view returns (bytes32 orderHash) {
        require(
            listingOrder.startTime <= block.timestamp,
            Errors.ORDER_NOT_STARTED
        );
        require(listingOrder.endTime >= block.timestamp, Errors.ORDER_EXPIRED);

        orderHash = getListingOrderHash(listingOrder);
        require(
            listingOrderStatus[orderHash] !=
                IApeStakingP2P.ListingOrderStatus.Cancelled,
            Errors.ORDER_ALREADY_CANCELLED
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
                Errors.INVALID_SIGNATURE
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
            Errors.NOT_THE_OWNER
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
            apeCoinOrder.token == DataTypes.SApeAddress,
            Errors.INVALID_TOKEN
        );
        require(
            listingOrderStatus[orderHash] !=
                IApeStakingP2P.ListingOrderStatus.Matched,
            Errors.ORDER_ALREADY_MATCHED
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

        require(bakcOrder.token == vars.bakc, Errors.INVALID_TOKEN);
        require(
            IERC721(vars.nBakc).ownerOf(bakcOrder.tokenId) == bakcOrder.offerer,
            Errors.NOT_THE_OWNER
        );
    }

    function _prepareApeCoin(
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
        address cApe,
        address user,
        uint256 amount
    ) internal {
        uint256 freeShareBalanceNeeded = ICApe(cApe).getShareByPooledApe(
            amount
        );
        IParaApeStaking.SApeBalance memory sApeBalanceCache = sApeBalance[user];
        require(
            sApeBalanceCache.freeShareBalance >= freeShareBalanceNeeded,
            Errors.SAPE_FREE_BALANCE_NOT_ENOUGH
        );
        sApeBalanceCache.freeShareBalance -= freeShareBalanceNeeded.toUint128();
        sApeBalanceCache.stakedBalance += amount.toUint128();
        sApeBalance[user] = sApeBalanceCache;

        IAutoCompoundApe(cApe).withdraw(amount);
    }

    function _updateUserSApeBalance(
        mapping(address => IParaApeStaking.SApeBalance) storage sApeBalance,
        address user,
        uint256 apeCoinAmount,
        uint256 cApeExchangeRate
    ) internal {
        uint256 freeSApeBalanceAdded = apeCoinAmount.rayDiv(cApeExchangeRate);
        IParaApeStaking.SApeBalance memory sApeBalanceCache = sApeBalance[user];
        sApeBalanceCache.freeShareBalance += freeSApeBalanceAdded.toUint128();
        sApeBalanceCache.stakedBalance -= apeCoinAmount.toUint128();
        sApeBalance[user] = sApeBalanceCache;
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
            revert(Errors.INVALID_TOKEN);
        }
    }

    function _ifCanLiquidateApeCoinOffererSApe(
        address pool,
        uint16 sApeReserveId,
        address user
    ) internal view returns (bool) {
        DataTypes.UserConfigurationMap memory userConfig = IPool(pool)
            .getUserConfiguration(user);
        bool usageAsCollateralEnabled = userConfig.isUsingAsCollateral(
            sApeReserveId
        );

        if (usageAsCollateralEnabled && userConfig.isBorrowingAny()) {
            (, , , , , uint256 healthFactor, ) = IPool(pool).getUserAccountData(
                user
            );
            return
                healthFactor <
                ApeStakingCommonLogic.HEALTH_FACTOR_LIQUIDATION_THRESHOLD;
        }
        return false;
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
                    order.apeCoinShare
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
