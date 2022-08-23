// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import {GenericLogic} from "./GenericLogic.sol";
import {DataTypes} from "../../libraries/types/DataTypes.sol";
import {IPriceOracleGetter} from "../../../interfaces/IPriceOracleGetter.sol";

/**
 * @title AuctionLiquidationLogic library
 *
 **/
library AuctionLiquidationLogic {
    uint256 public constant THRESHOLD = 110;
    uint256 public constant MIN_BID_THRESHOLD = 0.001 ether;

    /// @notice when a new action is started
    event AuctionStarted(address who, uint256 startTime, uint256 endTime);

    /// @notice emit a message when we have a new highest bidder
    event HighestBid(
        address who,
        uint256 amount,
        address collateralAsset,
        uint256 collateralTokenId
    );

    struct AuctionLiquidationStartLocalVars {
        uint256 healthFactor;
    }

    struct AuctionLiquidationEndLocalVars {
        uint256 healthFactor;
        uint256 collateralPrice;
    }

    /// @notice let anyone start an auction if the health factory of an
    /// nft is below the target.
    function executeAuctionLiquidationStart(
        mapping(address => mapping(uint256 => DataTypes.Auction))
            storage auctionData,
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        mapping(address => DataTypes.UserConfigurationMap) storage usersConfig,
        DataTypes.ExecuteAuctionLiquidationStartParams memory params
    ) external {
        AuctionLiquidationEndLocalVars memory vars;

        DataTypes.UserConfigurationMap storage userConfig = usersConfig[
            params.user
        ];

        (, , , , , , , vars.healthFactor, , ) = GenericLogic
            .calculateUserAccountData(
                reservesData,
                reservesList,
                DataTypes.CalculateUserAccountDataParams({
                    userConfig: userConfig,
                    reservesCount: params.reservesCount,
                    user: params.user,
                    oracle: params.priceOracle
                })
            );

        // check that users health is below threshold
        require(
            vars.healthFactor < THRESHOLD,
            "Users health factor must be below the threshold"
        );

        DataTypes.Auction storage _auction = auctionData[
            params.collateralAsset
        ][params.collateralTokenId];

        // set values
        _auction.endTime = block.timestamp + 2 days;
    }

    /// @notice let anyone end an auction if the time is up
    function executeAuctionLiquidationEnd(
        mapping(address => mapping(uint256 => DataTypes.Auction))
            storage auctionData,
        mapping(address => DataTypes.ReserveData) storage reservesData,
        mapping(uint256 => address) storage reservesList,
        mapping(address => DataTypes.UserConfigurationMap) storage usersConfig,
        DataTypes.ExecuteAuctionLiquidationEndParams memory params
    ) external {
        AuctionLiquidationEndLocalVars memory vars;

        DataTypes.Auction storage _auction = auctionData[
            params.collateralAsset
        ][params.collateralTokenId];

        // check if the auction is still going - check if time is up
        require(
            block.timestamp > _auction.endTime,
            "Auction end time not reached"
        );

        // check if is still pending
        require(!_auction.isResolved, "Auction is already resolved");

        // set resolved
        _auction.isResolved = true;

        // check caller is highest bid
        require(
            params.bidder == _auction.highestBidder,
            "Caller is not the highest bidder"
        );

        // check highest bid is above 95% of floor
        vars.collateralPrice = IPriceOracleGetter(params.priceOracle)
            .getAssetPrice(params.collateralAsset);
        require(
            _auction.highestBid > (95 * vars.collateralPrice) / 100,
            "Highest bid is not above 95% of floor"
        );

        // check that collateral owner is still underwater
        DataTypes.UserConfigurationMap storage userConfig = usersConfig[
            params.user
        ];

        (, , , , , , , vars.healthFactor, , ) = GenericLogic
            .calculateUserAccountData(
                reservesData,
                reservesList,
                DataTypes.CalculateUserAccountDataParams({
                    userConfig: userConfig,
                    reservesCount: params.reservesCount,
                    user: params.user,
                    oracle: params.priceOracle
                })
            );

        require(
            vars.healthFactor < THRESHOLD,
            "Users health factor must be below the threshold"
        );

        /// TODO: settle debt from liquidation

        // repay debt
        // or supply -> wrapped eth gw
        // also pay fee
    }

    /// @notice people should be able to bid
    function executeAuctionLiquidationBid(
        mapping(address => mapping(uint256 => DataTypes.Auction))
            storage auctionData,
        DataTypes.ExecuteAuctionLiquidationBidParams memory params
    ) external {
        DataTypes.Auction storage _auction = auctionData[
            params.collateralAsset
        ][params.collateralTokenId];

        require(
            params.bidAmount > MIN_BID_THRESHOLD,
            "Bid is too small, please increase"
        );

        require(
            params.bidAmount > _auction.highestBid,
            "Bid is not higher than existing highest bid"
        );

        // return previous amount to last highest bidder
        payable(_auction.highestBidder).transfer(_auction.highestBid);

        // set the new highest bid/bidder
        _auction.highestBid = params.bidAmount;
        _auction.highestBidder = params.bidder;
        emit HighestBid(
            params.bidder,
            params.bidAmount,
            params.collateralAsset,
            params.collateralTokenId
        );
    }
}
