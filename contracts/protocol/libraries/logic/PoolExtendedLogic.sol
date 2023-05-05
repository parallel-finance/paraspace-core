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

    function executeInitiateBlurExchangeRequest(
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider,
        DataTypes.BlurBuyWithCreditRequest[] calldata requests
    ) external {
        address keeper = ps._blurExchangeKeeper;
        ValidationLogic.validateStatusForBlurExchangeRequest(
            ps._blurExchangeEnable,
            keeper,
            ps._blurOngoingRequestAmount + requests.length,
            ps._blurOngoingRequestLimit
        );

        ps._blurOngoingRequestAmount += requests.length.toUint8();

        uint256 totalBorrow = 0;
        address weth = poolAddressProvider.getWETH();
        address oracle = poolAddressProvider.getPriceOracle();
        DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
            msg.sender
        ];

        //validate request and mint nToken
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
        {
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

        // we update status here to prevent consuming gas for saving requestHash or calculating requestHash twice
        //update status
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
        uint256 remainingETH = msg.value;
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
            require(
                remainingETH >= request.listingPrice,
                Errors.INVALID_ETH_VALUE
            );
            remainingETH -= request.listingPrice;

            delete ps._blurExchangeRequestStatus[requestHash];

            DataTypes.ReserveData storage nftReserve = ps._reserves[
                request.collection
            ];
            address nTokenAddress = nftReserve.xTokenAddress;
            address currentOwner = INToken(nTokenAddress).ownerOf(
                request.tokenId
            );
            //here we repay and supply weth for currentOwner in case nToken has been liquidated
            repayAndSupplyForUser(
                ps,
                weth,
                address(this),
                currentOwner,
                request.listingPrice
            );

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
        require(remainingETH == 0, Errors.INVALID_ETH_VALUE);

        ps._blurOngoingRequestAmount -= requestLength.toUint8();
    }

    function executeGetBlurExchangeRequestStatus(
        DataTypes.PoolStorage storage ps,
        DataTypes.BlurBuyWithCreditRequest calldata request
    ) external view returns (DataTypes.BlurBuyWithCreditRequestStatus) {
        bytes32 requestHash = _calculateBlurExchangeRequestHash(request);
        return ps._blurExchangeRequestStatus[requestHash];
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
        (, uint64 collateralizedBalance) = INToken(nTokenAddress).burn(
            user,
            releaseUnderlying ? user : nTokenAddress,
            tokenIds,
            timeLockParams
        );
        if (collateralizedBalance == 0) {
            userConfig.setUsingAsCollateral(reserveIndex, false);
            emit ReserveUsedAsCollateralDisabled(asset, user);
        }
    }
}
