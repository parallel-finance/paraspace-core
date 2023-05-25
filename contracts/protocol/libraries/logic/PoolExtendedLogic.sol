// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {DataTypes} from "../types/DataTypes.sol";
import {Errors} from "../helpers/Errors.sol";
import {SupplyLogic} from "./SupplyLogic.sol";
import {BorrowLogic} from "./BorrowLogic.sol";
import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";
import {INToken} from "../../../interfaces/INToken.sol";
import {IAuctionableERC721} from "../../../interfaces/IAuctionableERC721.sol";
import {UserConfiguration} from "../configuration/UserConfiguration.sol";
import {Math} from "../../../dependencies/openzeppelin/contracts/Math.sol";
import {SafeCast} from "../../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {Helpers} from "../helpers/Helpers.sol";
import {IPoolAddressesProvider} from "../../../interfaces/IPoolAddressesProvider.sol";
import {ValidationLogic} from "./ValidationLogic.sol";
import {IWETH} from "../../../misc/interfaces/IWETH.sol";
import {IPToken} from "../../../interfaces/IPToken.sol";
import {IERC721} from "../../../dependencies/openzeppelin/contracts/IERC721.sol";
import {PercentageMath} from "../../../protocol/libraries/math/PercentageMath.sol";
import {ApeCoinStaking} from "../../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {INTokenApeStaking} from "../../../interfaces/INTokenApeStaking.sol";
import {NTokenBAKC} from "../../tokenization/NTokenBAKC.sol";
import {XTokenType, IXTokenType} from "../../../interfaces/IXTokenType.sol";

library PoolExtendedLogic {
    using Math for uint256;
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using PercentageMath for uint256;
    using SafeCast for uint256;

    event ReserveUsedAsCollateralDisabled(
        address indexed reserve,
        address indexed user
    );

    event BlurExchangeRequestInitiated(
        address indexed initiator,
        address paymentToken,
        uint256 listingPrice,
        uint256 borrowAmount,
        address collection,
        uint256 tokenId
    );

    event BlurExchangeRequestFulfilled(
        address indexed initiator,
        address paymentToken,
        uint256 listingPrice,
        uint256 borrowAmount,
        address collection,
        uint256 tokenId
    );

    event BlurExchangeRequestRejected(
        address indexed initiator,
        address paymentToken,
        uint256 listingPrice,
        uint256 borrowAmount,
        address collection,
        uint256 tokenId
    );

    event AcceptBlurBidsRequestInitiated(
        address indexed initiator,
        address paymentToken,
        uint256 bidingPrice,
        uint256 marketPlaceFee,
        address collection,
        uint256 tokenId,
        bytes32 bidOrderHash
    );

    event AcceptBlurBidsRequestFulfilled(
        address indexed initiator,
        address paymentToken,
        uint256 bidingPrice,
        uint256 marketPlaceFee,
        address collection,
        uint256 tokenId,
        bytes32 bidOrderHash
    );

    event AcceptBlurBidsRequestRejected(
        address indexed initiator,
        address paymentToken,
        uint256 bidingPrice,
        uint256 marketPlaceFee,
        address collection,
        uint256 tokenId,
        bytes32 bidOrderHash
    );

    function executeInitiateBlurExchangeRequest(
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider,
        DataTypes.BlurBuyWithCreditRequest[] calldata requests
    ) external {
        address keeper = ps._blurExchangeKeeper;
        //check and update overall status
        {
            uint256 ongoingRequestAmount = ps._blurOngoingRequestAmount +
                requests.length;
            ValidationLogic.validateStatusForRequest(
                ps._blurExchangeEnable,
                keeper,
                ongoingRequestAmount,
                ps._blurOngoingRequestLimit
            );
            ps._blurOngoingRequestAmount = ongoingRequestAmount.toUint8();
        }

        uint256 totalBorrow = 0;
        address weth = poolAddressProvider.getWETH();
        address oracle = poolAddressProvider.getPriceOracle();
        DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
            msg.sender
        ];

        //validate request and mint nToken for every single request
        {
            uint256 remainingETH = msg.value;
            uint256 requestFeeRate = ps._blurExchangeRequestFeeRate;
            for (uint256 index = 0; index < requests.length; index++) {
                DataTypes.BlurBuyWithCreditRequest calldata request = requests[
                    index
                ];
                uint256 needCashETH = initiateBlurExchangeRequest(
                    ps,
                    userConfig,
                    request,
                    remainingETH,
                    requestFeeRate,
                    oracle
                );
                remainingETH -= needCashETH;
                totalBorrow += request.borrowAmount;
            }
            require(remainingETH == 0, Errors.INVALID_ETH_VALUE);
        }

        //mint debt token
        if (totalBorrow > 0) {
            BorrowLogic.executeBorrow(
                ps._reserves,
                ps._reservesList,
                userConfig,
                DataTypes.ExecuteBorrowParams({
                    asset: weth,
                    user: msg.sender,
                    onBehalfOf: msg.sender,
                    amount: totalBorrow,
                    referralCode: 0,
                    releaseUnderlying: false,
                    reservesCount: ps._reservesCount,
                    oracle: oracle,
                    priceOracleSentinel: poolAddressProvider
                        .getPriceOracleSentinel()
                })
            );
        }

        //transfer currency to keeper
        if (totalBorrow > 0) {
            DataTypes.TimeLockParams memory timeLockParams;
            IPToken(ps._reserves[weth].xTokenAddress).transferUnderlyingTo(
                address(this),
                totalBorrow,
                timeLockParams
            );
            IWETH(weth).withdraw(totalBorrow);
        }
        Helpers.safeTransferETH(keeper, msg.value + totalBorrow);
    }

    function initiateBlurExchangeRequest(
        DataTypes.PoolStorage storage ps,
        DataTypes.UserConfigurationMap storage userConfig,
        DataTypes.BlurBuyWithCreditRequest calldata request,
        uint256 remainingETH,
        uint256 requestFeeRate,
        address oracle
    ) internal returns (uint256) {
        bytes32 requestHash = _calculateBlurExchangeRequestHash(request);
        uint256 requestFee = request.listingPrice.percentMul(requestFeeRate);
        ValidationLogic.validateInitiateBlurExchangeRequest(
            ps._reserves[request.collection],
            request,
            ps._blurExchangeRequestStatus[requestHash],
            remainingETH,
            requestFee,
            oracle
        );

        //mint nToken to release credit value
        DataTypes.ERC721SupplyParams[]
            memory tokenData = new DataTypes.ERC721SupplyParams[](1);
        tokenData[0] = DataTypes.ERC721SupplyParams(request.tokenId, true);
        SupplyLogic.executeSupplyERC721(
            ps._reserves,
            userConfig,
            DataTypes.ExecuteSupplyERC721Params({
                asset: request.collection,
                tokenData: tokenData,
                onBehalfOf: request.initiator,
                payer: address(0),
                referralCode: 0
            })
        );

        //update status here to prevent consuming gas for saving requestHash or calculating requestHash twice
        ps._blurExchangeRequestStatus[requestHash] = DataTypes
            .BlurBuyWithCreditRequestStatus
            .Initiated;

        //emit event
        emit BlurExchangeRequestInitiated(
            request.initiator,
            request.paymentToken,
            request.listingPrice,
            request.borrowAmount,
            request.collection,
            request.tokenId
        );

        return request.listingPrice + requestFee - request.borrowAmount;
    }

    function executeFulfillBlurExchangeRequest(
        DataTypes.PoolStorage storage ps,
        DataTypes.BlurBuyWithCreditRequest[] calldata requests
    ) external {
        address keeper = ps._blurExchangeKeeper;
        require(msg.sender == keeper, Errors.CALLER_NOT_KEEPER);

        uint256 requestLength = requests.length;
        for (uint256 index = 0; index < requestLength; index++) {
            DataTypes.BlurBuyWithCreditRequest calldata request = requests[
                index
            ];
            // check request status
            bytes32 requestHash = _calculateBlurExchangeRequestHash(request);
            require(
                ps._blurExchangeRequestStatus[requestHash] ==
                    DataTypes.BlurBuyWithCreditRequestStatus.Initiated,
                Errors.INVALID_REQUEST_STATUS
            );

            delete ps._blurExchangeRequestStatus[requestHash];

            DataTypes.ReserveData storage reserve = ps._reserves[
                request.collection
            ];
            IERC721(request.collection).safeTransferFrom(
                keeper,
                reserve.xTokenAddress,
                request.tokenId
            );

            emit BlurExchangeRequestFulfilled(
                request.initiator,
                request.paymentToken,
                request.listingPrice,
                request.borrowAmount,
                request.collection,
                request.tokenId
            );
        }

        ps._blurOngoingRequestAmount -= requestLength.toUint8();
    }

    function executeRejectBlurExchangeRequest(
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider,
        DataTypes.BlurBuyWithCreditRequest[] calldata requests
    ) external {
        address keeper = ps._blurExchangeKeeper;
        require(msg.sender == keeper, Errors.CALLER_NOT_KEEPER);

        uint256 requestLength = requests.length;
        address weth = poolAddressProvider.getWETH();
        IWETH(weth).deposit{value: msg.value}();
        address currentOwner;
        uint256 totalListingPrice;
        for (uint256 index = 0; index < requestLength; index++) {
            DataTypes.BlurBuyWithCreditRequest calldata request = requests[
                index
            ];
            // check request status
            bytes32 requestHash = _calculateBlurExchangeRequestHash(request);
            require(
                ps._blurExchangeRequestStatus[requestHash] ==
                    DataTypes.BlurBuyWithCreditRequestStatus.Initiated,
                Errors.INVALID_REQUEST_STATUS
            );

            delete ps._blurExchangeRequestStatus[requestHash];

            DataTypes.ReserveData storage nftReserve = ps._reserves[
                request.collection
            ];
            address nTokenAddress = nftReserve.xTokenAddress;

            // check if have the same owner
            address nTokenOwner = INToken(nTokenAddress).ownerOf(
                request.tokenId
            );
            if (currentOwner == address(0)) {
                currentOwner = nTokenOwner;
            } else {
                require(
                    currentOwner == nTokenOwner,
                    Errors.NOT_SAME_NTOKEN_OWNER
                );
            }

            totalListingPrice += request.listingPrice;

            //burn nToken.
            burnUserNToken(
                ps._usersConfig[currentOwner],
                request.collection,
                nftReserve.id,
                nTokenAddress,
                request.tokenId,
                false,
                true,
                currentOwner
            );

            emit BlurExchangeRequestRejected(
                request.initiator,
                request.paymentToken,
                request.listingPrice,
                request.borrowAmount,
                request.collection,
                request.tokenId
            );
        }
        require(msg.value == totalListingPrice, Errors.INVALID_ETH_VALUE);

        //here we repay and supply weth for currentOwner in case nToken has been liquidated from request initiator
        repayAndSupplyForUser(
            ps,
            weth,
            address(this),
            currentOwner,
            totalListingPrice
        );

        ps._blurOngoingRequestAmount -= requestLength.toUint8();
    }

    function executeGetBlurExchangeRequestStatus(
        DataTypes.PoolStorage storage ps,
        DataTypes.BlurBuyWithCreditRequest calldata request
    ) external view returns (DataTypes.BlurBuyWithCreditRequestStatus) {
        bytes32 requestHash = _calculateBlurExchangeRequestHash(request);
        return ps._blurExchangeRequestStatus[requestHash];
    }

    function executeInitiateAcceptBlurBidsRequest(
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider,
        DataTypes.AcceptBlurBidsRequest[] calldata requests
    ) external {
        address keeper = ps._acceptBlurBidsKeeper;
        //check and update overall status
        {
            uint256 ongoingRequestAmount = ps
                ._acceptBlurBidsOngoingRequestAmount + requests.length;
            ValidationLogic.validateStatusForRequest(
                ps._acceptBlurBidsEnable,
                keeper,
                ongoingRequestAmount,
                ps._acceptBlurBidsRequestLimit
            );
            ps._acceptBlurBidsOngoingRequestAmount = ongoingRequestAmount
                .toUint8();
        }

        // validate user's health factor, if HF drops below 1 before keeper finalize the request, nToken can be liquidated.
        address oracle = poolAddressProvider.getPriceOracle();
        ValidationLogic.validateHealthFactor(
            ps._reserves,
            ps._reservesList,
            ps._usersConfig[msg.sender],
            msg.sender,
            ps._reservesCount,
            oracle
        );

        //validate and handle every single request
        address weth = poolAddressProvider.getWETH();
        uint256 requestFeeRate = ps._acceptBlurBidsRequestFeeRate;
        uint256 totalFee = 0;
        for (uint256 index = 0; index < requests.length; index++) {
            DataTypes.AcceptBlurBidsRequest calldata request = requests[index];
            bytes32 requestHash = _calculateAcceptBlurBidsRequestHash(request);
            totalFee += request.bidingPrice.percentMul(requestFeeRate);

            address nTokenAddress = ps
                ._reserves[request.collection]
                .xTokenAddress;

            //validate request
            ValidationLogic.validateInitiateAcceptBlurBidsRequest(
                ps,
                nTokenAddress,
                request,
                requestHash,
                weth,
                oracle
            );

            //check if any ape coin position exist on the Ape
            {
                XTokenType tokenType = INToken(nTokenAddress).getXTokenType();
                if (tokenType == XTokenType.NTokenBAYC) {
                    _ensureApeCoinPositionNotExistedOn(
                        INTokenApeStaking(nTokenAddress).getApeStaking(),
                        1,
                        request.tokenId
                    );
                } else if (tokenType == XTokenType.NTokenMAYC) {
                    _ensureApeCoinPositionNotExistedOn(
                        INTokenApeStaking(nTokenAddress).getApeStaking(),
                        2,
                        request.tokenId
                    );
                } else if (tokenType == XTokenType.NTokenBAKC) {
                    _ensureApeCoinPositionNotExistedOn(
                        NTokenBAKC(nTokenAddress).getApeStaking(),
                        3,
                        request.tokenId
                    );
                }
            }

            // transfer underlying nft from nToken to keeper
            DataTypes.TimeLockParams memory timeLockParams;
            INToken(nTokenAddress).transferUnderlyingTo(
                keeper,
                request.tokenId,
                timeLockParams
            );

            // update request status
            ps._acceptBlurBidsRequestStatus[requestHash] = DataTypes
                .AcceptBlurBidsRequestStatus
                .Initiated;

            //emit event
            emit AcceptBlurBidsRequestInitiated(
                request.initiator,
                request.paymentToken,
                request.bidingPrice,
                request.marketPlaceFee,
                request.collection,
                request.tokenId,
                request.bidOrderHash
            );
        }

        require(totalFee == msg.value, Errors.INVALID_ETH_VALUE);
        //transfer fee to keeper
        if (totalFee > 0) {
            Helpers.safeTransferETH(keeper, totalFee);
        }
    }

    function executeFulfillAcceptBlurBidsRequest(
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider,
        DataTypes.AcceptBlurBidsRequest[] calldata requests
    ) external {
        address keeper = ps._acceptBlurBidsKeeper;
        require(msg.sender == keeper, Errors.CALLER_NOT_KEEPER);

        uint256 requestLength = requests.length;
        uint256 totalWETH = 0;
        address currentOwner;
        for (uint256 index = 0; index < requestLength; index++) {
            DataTypes.AcceptBlurBidsRequest calldata request = requests[index];
            // check request status
            bytes32 requestHash = _calculateAcceptBlurBidsRequestHash(request);
            require(
                ps._acceptBlurBidsRequestStatus[requestHash] ==
                    DataTypes.AcceptBlurBidsRequestStatus.Initiated,
                Errors.INVALID_REQUEST_STATUS
            );

            DataTypes.ReserveData storage nftReserve = ps._reserves[
                request.collection
            ];
            address nTokenAddress = nftReserve.xTokenAddress;

            // check if have the same owner
            address nTokenOwner = INToken(nTokenAddress).ownerOf(
                request.tokenId
            );
            if (currentOwner == address(0)) {
                currentOwner = nTokenOwner;
            } else {
                require(
                    currentOwner == nTokenOwner,
                    Errors.NOT_SAME_NTOKEN_OWNER
                );
            }

            // calculate and accumulate weth
            totalWETH += (request.bidingPrice - request.marketPlaceFee);

            // update request status
            delete ps._blurExchangeRequestStatus[requestHash];

            //burn ntoken
            burnUserNToken(
                ps._usersConfig[currentOwner],
                request.collection,
                nftReserve.id,
                nTokenAddress,
                request.tokenId,
                false,
                true,
                currentOwner
            );

            //emit event
            emit AcceptBlurBidsRequestFulfilled(
                request.initiator,
                request.paymentToken,
                request.bidingPrice,
                request.marketPlaceFee,
                request.collection,
                request.tokenId,
                request.bidOrderHash
            );
        }

        //supply eth for current ntoken owner
        if (totalWETH > 0) {
            address weth = poolAddressProvider.getWETH();
            supplyForUser(ps, weth, keeper, currentOwner, totalWETH);
        }

        // update ongoing request amount
        ps._acceptBlurBidsOngoingRequestAmount -= requestLength.toUint8();
    }

    function executeRejectAcceptBlurBidsRequest(
        DataTypes.PoolStorage storage ps,
        DataTypes.AcceptBlurBidsRequest[] calldata requests
    ) external {
        address keeper = ps._acceptBlurBidsKeeper;
        require(msg.sender == keeper, Errors.CALLER_NOT_KEEPER);

        uint256 requestLength = requests.length;
        for (uint256 index = 0; index < requestLength; index++) {
            DataTypes.AcceptBlurBidsRequest calldata request = requests[index];
            // check request status
            bytes32 requestHash = _calculateAcceptBlurBidsRequestHash(request);
            require(
                ps._acceptBlurBidsRequestStatus[requestHash] ==
                    DataTypes.AcceptBlurBidsRequestStatus.Initiated,
                Errors.INVALID_REQUEST_STATUS
            );

            // update request status
            delete ps._blurExchangeRequestStatus[requestHash];

            //transfer underlying nft back to nToken
            DataTypes.ReserveData storage nftReserve = ps._reserves[
                request.collection
            ];
            IERC721(request.collection).safeTransferFrom(
                keeper,
                nftReserve.xTokenAddress,
                request.tokenId
            );

            //emit event
            emit AcceptBlurBidsRequestRejected(
                request.initiator,
                request.paymentToken,
                request.bidingPrice,
                request.marketPlaceFee,
                request.collection,
                request.tokenId,
                request.bidOrderHash
            );
        }

        // update ongoing request amount
        ps._acceptBlurBidsOngoingRequestAmount -= requestLength.toUint8();
    }

    function executeGetAcceptBlurBidsRequestStatus(
        DataTypes.PoolStorage storage ps,
        DataTypes.AcceptBlurBidsRequest calldata request
    ) external view returns (DataTypes.AcceptBlurBidsRequestStatus) {
        bytes32 requestHash = _calculateAcceptBlurBidsRequestHash(request);
        return ps._acceptBlurBidsRequestStatus[requestHash];
    }

    function _calculateBlurExchangeRequestHash(
        DataTypes.BlurBuyWithCreditRequest calldata request
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    request.initiator,
                    request.paymentToken,
                    request.listingPrice,
                    request.borrowAmount,
                    request.collection,
                    request.tokenId
                )
            );
    }

    function _calculateAcceptBlurBidsRequestHash(
        DataTypes.AcceptBlurBidsRequest calldata request
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    request.initiator,
                    request.paymentToken,
                    request.bidingPrice,
                    request.marketPlaceFee,
                    request.collection,
                    request.tokenId,
                    request.bidOrderHash
                )
            );
    }

    function repayAndSupplyForUser(
        DataTypes.PoolStorage storage ps,
        address asset,
        address payer,
        address onBehalfOf,
        uint256 totalAmount
    ) public {
        address variableDebtTokenAddress = ps
            ._reserves[asset]
            .variableDebtTokenAddress;
        uint256 repayAmount = Math.min(
            IERC20(variableDebtTokenAddress).balanceOf(onBehalfOf),
            totalAmount
        );
        repayForUser(ps, asset, payer, onBehalfOf, repayAmount);
        supplyForUser(ps, asset, payer, onBehalfOf, totalAmount - repayAmount);
    }

    function supplyForUser(
        DataTypes.PoolStorage storage ps,
        address asset,
        address payer,
        address onBehalfOf,
        uint256 amount
    ) public {
        if (amount == 0) {
            return;
        }
        DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
            onBehalfOf
        ];
        SupplyLogic.executeSupply(
            ps._reserves,
            userConfig,
            DataTypes.ExecuteSupplyParams({
                asset: asset,
                amount: amount,
                onBehalfOf: onBehalfOf,
                payer: payer,
                referralCode: 0
            })
        );
        Helpers.setAssetUsedAsCollateral(
            userConfig,
            ps._reserves,
            asset,
            onBehalfOf
        );
    }

    function repayForUser(
        DataTypes.PoolStorage storage ps,
        address asset,
        address payer,
        address onBehalfOf,
        uint256 amount
    ) public returns (uint256) {
        if (amount == 0) {
            return 0;
        }
        return
            BorrowLogic.executeRepay(
                ps._reserves,
                ps._usersConfig[onBehalfOf],
                DataTypes.ExecuteRepayParams({
                    asset: asset,
                    amount: amount,
                    onBehalfOf: onBehalfOf,
                    payer: payer,
                    usePTokens: false
                })
            );
    }

    function burnUserNToken(
        DataTypes.UserConfigurationMap storage userConfig,
        address asset,
        uint256 reserveIndex,
        address nTokenAddress,
        uint256 tokenId,
        bool releaseUnderlying,
        bool endStartedAuction,
        address user
    ) public {
        if (
            endStartedAuction &&
            IAuctionableERC721(nTokenAddress).isAuctioned(tokenId)
        ) {
            IAuctionableERC721(nTokenAddress).endAuction(tokenId);
        }

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        // no time lock needed here
        DataTypes.TimeLockParams memory timeLockParams;
        (
            uint64 oldCollateralizedBalance,
            uint64 collateralizedBalance
        ) = INToken(nTokenAddress).burn(
                user,
                releaseUnderlying ? user : nTokenAddress,
                tokenIds,
                timeLockParams
            );
        if (oldCollateralizedBalance > 0 && collateralizedBalance == 0) {
            userConfig.setUsingAsCollateral(reserveIndex, false);
            emit ReserveUsedAsCollateralDisabled(asset, user);
        }
    }

    function _ensureApeCoinPositionNotExistedOn(
        ApeCoinStaking apeStaking,
        uint256 poolId,
        uint256 tokenId
    ) internal view {
        (uint256 stakedAmount, ) = apeStaking.nftPosition(poolId, tokenId);
        require(stakedAmount == 0, Errors.EXISTING_APE_STAKING);
    }
}
