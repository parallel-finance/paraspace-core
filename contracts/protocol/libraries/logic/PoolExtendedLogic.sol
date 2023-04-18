// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {DataTypes} from "../types/DataTypes.sol";
import {Errors} from "../helpers/Errors.sol";
import {SupplyLogic} from "./SupplyLogic.sol";
import {BorrowLogic} from "./BorrowLogic.sol";
import {IERC20} from "../../../dependencies/openzeppelin/contracts/IERC20.sol";
import {INToken} from "../../../interfaces/INToken.sol";
import {UserConfiguration} from "../configuration/UserConfiguration.sol";
import {Math} from "../../../dependencies/openzeppelin/contracts/Math.sol";
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
        DataTypes.BlurBuyWithCreditRequest calldata request
    ) external {
        //check request status
        bytes32 requestHash = _calculateBlurExchangeRequestHash(request);
        require(
            ps._blurExchangeRequestStatus[requestHash] ==
                DataTypes.BlurBuyWithCreditRequestStatus.Default,
            Errors.INVALID_REQUEST_STATUS
        );

        address weth = poolAddressProvider.getWETH();
        address oracle = poolAddressProvider.getPriceOracle();
        address keeper = ps._blurExchangeKeeper;
        DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
            request.initiator
        ];

        ps._blurOngoingRequestAmount += 1;
        uint256 requestFee = request.listingPrice.percentMul(
            ps._blurExchangeRequestFeeRate
        );
        ValidationLogic.validateInitiateBlurExchangeRequest(
            ps._reserves[request.collection],
            request,
            ps._blurExchangeEnable,
            keeper,
            requestFee,
            ps._blurOngoingRequestAmount,
            ps._blurOngoingRequestLimit,
            oracle
        );

        //mint nToken to release credit value
        {
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
        }

        //mint debt token
        if (request.borrowAmount > 0) {
            BorrowLogic.executeBorrow(
                ps._reserves,
                ps._reservesList,
                userConfig,
                DataTypes.ExecuteBorrowParams({
                    asset: weth,
                    user: request.initiator,
                    onBehalfOf: request.initiator,
                    amount: request.borrowAmount,
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
            if (request.borrowAmount > 0) {
                DataTypes.TimeLockParams memory timeLockParams;
                IPToken(ps._reserves[weth].xTokenAddress).transferUnderlyingTo(
                    address(this),
                    request.borrowAmount,
                    timeLockParams
                );
                IWETH(weth).withdraw(request.borrowAmount);
            }
            Helpers.safeTransferETH(keeper, request.listingPrice + requestFee);
        }

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
    }

    function executeFulfillBlurExchangeRequest(
        DataTypes.PoolStorage storage ps,
        DataTypes.BlurBuyWithCreditRequest calldata request
    ) external {
        // check request status
        bytes32 requestHash = _calculateBlurExchangeRequestHash(request);
        require(
            ps._blurExchangeRequestStatus[requestHash] ==
                DataTypes.BlurBuyWithCreditRequestStatus.Initiated,
            Errors.INVALID_REQUEST_STATUS
        );

        address keeper = ps._blurExchangeKeeper;
        require(msg.sender == keeper, Errors.CALLER_NOT_KEEPER);

        ps._blurOngoingRequestAmount -= 1;

        DataTypes.ReserveData storage reserve = ps._reserves[
            request.collection
        ];
        IERC721(request.collection).safeTransferFrom(
            keeper,
            reserve.xTokenAddress,
            request.tokenId
        );

        delete ps._blurExchangeRequestStatus[requestHash];

        emit BlurExchangeRequestFulfilled(
            request.initiator,
            request.paymentToken,
            request.listingPrice,
            request.borrowAmount,
            request.collection,
            request.tokenId
        );
    }

    function executeRejectBlurExchangeRequest(
        DataTypes.PoolStorage storage ps,
        IPoolAddressesProvider poolAddressProvider,
        DataTypes.BlurBuyWithCreditRequest calldata request
    ) external {
        // check request status
        bytes32 requestHash = _calculateBlurExchangeRequestHash(request);
        require(
            ps._blurExchangeRequestStatus[requestHash] ==
                DataTypes.BlurBuyWithCreditRequestStatus.Initiated,
            Errors.INVALID_REQUEST_STATUS
        );

        address keeper = ps._blurExchangeKeeper;
        require(msg.sender == keeper, Errors.CALLER_NOT_KEEPER);

        ps._blurOngoingRequestAmount -= 1;

        //repay and supply weth for user
        address weth = poolAddressProvider.getWETH();
        require(msg.value == request.listingPrice, Errors.INVALID_ETH_VALUE);
        IWETH(weth).deposit{value: request.listingPrice}();
        repayAndSupplyForUser(
            ps,
            weth,
            address(this),
            request.initiator,
            request.listingPrice
        );

        //burn nToken.
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = request.tokenId;
        burnUserNToken(
            ps,
            request.collection,
            tokenIds,
            false,
            request.initiator
        );

        delete ps._blurExchangeRequestStatus[requestHash];

        emit BlurExchangeRequestRejected(
            request.initiator,
            request.paymentToken,
            request.listingPrice,
            request.borrowAmount,
            request.collection,
            request.tokenId
        );
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
        DataTypes.PoolStorage storage ps,
        address asset,
        uint256[] memory tokenIds,
        bool releaseUnderlying,
        address user
    ) public {
        DataTypes.ReserveData storage nftReserve = ps._reserves[asset];
        address nTokenAddress = nftReserve.xTokenAddress;
        // no time lock needed here
        DataTypes.TimeLockParams memory timeLockParams;
        (, uint64 collateralizedBalance) = INToken(nTokenAddress).burn(
            user,
            releaseUnderlying ? user : nTokenAddress,
            tokenIds,
            timeLockParams
        );
        if (collateralizedBalance == 0) {
            DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
                user
            ];
            userConfig.setUsingAsCollateral(nftReserve.id, false);
            emit ReserveUsedAsCollateralDisabled(asset, user);
        }
    }
}
