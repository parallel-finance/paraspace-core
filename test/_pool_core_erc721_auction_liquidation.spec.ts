import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {parseEther} from "ethers/lib/utils";
import {ZERO_ADDRESS} from "../helpers/constants";
import {getAggregator} from "../helpers/contracts-getters";
import {advanceBlock, waitForTx} from "../helpers/misc-utils";
import {ProtocolErrors} from "../helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  borrowAndValidate,
  changePriceAndValidate,
  repayAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
} from "./helpers/validated-steps";

describe("Liquidation Auction", () => {
  let testEnv: TestEnv;
  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      users: [borrower, liquidator],
      bayc,
      dai,
      weth,
    } = testEnv;

    // assure asset prices for correct health factor calculations
    await changePriceAndValidate(bayc, "101");

    const daiAgg = await getAggregator(undefined, "DAI");
    await daiAgg.updateLatestAnswer("908578801039414");

    // Borrower deposits 3 BAYC and 5k DAI
    await supplyAndValidate(bayc, "3", borrower, true);
    await supplyAndValidate(dai, "5000", borrower, true);
    // use only one BAYC as collateral
    await switchCollateralAndValidate(borrower, bayc, false, 1);
    await switchCollateralAndValidate(borrower, bayc, false, 2);

    // Liquidator deposits 100k DAI and 10 wETH
    await supplyAndValidate(weth, "10", liquidator, true, "1000");
    await supplyAndValidate(dai, "100000", liquidator, true, "200000");

    // Borrower borrows 15k DAI
    await borrowAndValidate(dai, "15000", borrower);

    // HF = (0.8 * 101 + 5000 * 0.000908578801039414 * 0.9) / (15000 * 0.000908578801039414) = 6.2286730666666676349
    // ERC721 HF = (0.8 * 101) / (15000 * 0.000908578801039414 - 5000 * 0.000908578801039414) = 8.8930096000000014524

    return testEnv;
  };

  describe("ERC721 auction and auction liquidation test", () => {
    beforeEach("Load the initial environment variables", async () => {
      testEnv = await loadFixture(fixture);
    });

    it("TC-auction-liquidation-01 When user ERC721 HF is < 1, an auction can be started", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
      } = testEnv;
      // drop BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");
      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );
      expect(await nBAYC.isAuctioned(0)).to.be.true;
    });

    it("TC-auction-liquidation-02 When user ERC721 HF is >= 1, auction cannot be started", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
      } = testEnv;

      // try to start auction
      await expect(
        pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      ).to.be.revertedWith(
        ProtocolErrors.ERC721_HEALTH_FACTOR_NOT_BELOW_THRESHOLD
      );
    });

    it("TC-auction-liquidation-03 Uniswap ERC721 cannot be auctioned", async () => {
      const {pool, nUniswapV3} = testEnv;
      expect(
        (await pool.getReserveData(nUniswapV3.address)).auctionStrategyAddress
      ).to.be.equal(ZERO_ADDRESS);
    });

    it("TC-auction-liquidation-06 If ERC721 HF >= RECOVERY_HF(1.5),auction can be closed", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
      } = testEnv;

      // drop BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");

      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );

      // rise BAYC price to above recovery limit (HF > 1.5)
      await changePriceAndValidate(bayc, "101");

      expect(await nBAYC.isAuctioned(0)).to.be.true;

      //end auction
      await pool
        .connect(liquidator.signer)
        .endAuction(borrower.address, bayc.address, 0);

      expect(await nBAYC.isAuctioned(0)).to.be.false;
    });

    it("TC-auction-liquidation-07 Auction cannot be closed with ERC721 HF < RECOVERY_HFF(1.5)", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
      } = testEnv;

      // drop BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");

      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );

      // rise BAYC price to near liquidation limit (HF ~ 1.0 - 1.1)
      await changePriceAndValidate(bayc, "15");

      // try to end auction
      await expect(
        pool
          .connect(liquidator.signer)
          .endAuction(borrower.address, bayc.address, 0)
      ).to.be.revertedWith(
        ProtocolErrors.ERC721_HEALTH_FACTOR_NOT_ABOVE_THRESHOLD
      );
    });

    it("TC-auction-liquidation-08 Cannot execute auction liquidation if auction is not enabled on reserve", async () => {
      const {
        users: [borrower, liquidator],
        bayc,
        nBAYC,
        pool,
        configurator,
      } = testEnv;

      // disable auction first to test original liquidation
      await waitForTx(
        await configurator.setReserveAuctionStrategyAddress(
          bayc.address,
          ZERO_ADDRESS
        )
      );

      // rise BAYC price to near liquidation limit (HF ~ 1.0 - 1.1)
      await changePriceAndValidate(bayc, "15");

      // try to liquidate the NFT
      await expect(
        pool
          .connect(liquidator.signer)
          .liquidateERC721(
            bayc.address,
            borrower.address,
            0,
            parseEther("15").toString(),
            false,
            {gasLimit: 5000000}
          )
      ).revertedWith(ProtocolErrors.ERC721_HEALTH_FACTOR_NOT_BELOW_THRESHOLD);

      expect(await nBAYC.balanceOf(borrower.address)).to.be.equal(3);
    });

    it("TC-auction-liquidation-09 Cannot execute liquidation if NFT is not in auction", async () => {
      const {
        users: [borrower, liquidator],
        bayc,
        nBAYC,
        pool,
      } = testEnv;

      // drop BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");

      // try to liquidate the NFT
      await expect(
        pool
          .connect(liquidator.signer)
          .liquidateERC721(
            bayc.address,
            borrower.address,
            0,
            parseEther("24").toString(),
            false,
            {gasLimit: 5000000}
          )
      ).revertedWith(ProtocolErrors.AUCTION_NOT_STARTED);

      expect(await nBAYC.balanceOf(borrower.address)).to.be.equal(3);
    });

    it("TC-auction-liquidation-11 If auction is not enabled in the reserve, liquidator can liquidate using floor or atomic price if ERC721 HF < 1", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
        configurator,
      } = testEnv;

      // drop BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");

      // actualLiquidationAmount: 12 / 0.000908578801039414 / 1.05 = 12578.514285714287769 DAI

      // disable auction first to test original liquidation
      await waitForTx(
        await configurator.setReserveAuctionStrategyAddress(
          bayc.address,
          ZERO_ADDRESS
        )
      );
      pool
        .connect(liquidator.signer)
        .liquidateERC721(
          bayc.address,
          borrower.address,
          0,
          parseEther("8").toString(),
          false,
          {gasLimit: 5000000}
        );

      //There are three of them, one of them is liquidated, and only two are left
      expect(await nBAYC.balanceOf(borrower.address)).to.be.lt(3);
    });

    it("TC-auction-liquidation-12 User ERC721 HF is < 1 an auction is started. User repays and 1 <= ERC721 HF < RECOVERY_HF, liquidation is performed before auction ends.", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
        dai,
      } = testEnv;

      // drop BAYC price to liquidation levels (HF = 0.6)
      await changePriceAndValidate(bayc, "8");

      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );
      const {startTime, tickLength} = await pool.getAuctionData(
        nBAYC.address,
        0
      );
      await advanceBlock(
        startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
      );

      // borrower Repays 5k DAI (HF = 1.176)
      await repayAndValidate(dai, "5000", borrower);

      // liquidate the NFT

      await pool
        .connect(liquidator.signer)
        .liquidateERC721(
          bayc.address,
          borrower.address,
          0,
          parseEther("24").toString(),
          false,
          {gasLimit: 5000000}
        );

      expect(await nBAYC.balanceOf(borrower.address)).to.be.lt(3);
    });

    it("TC-auction-liquidation-13 User ERC721 HF is < 1 an auction is started. User repays and HF is > RECOVERY_HF, liquidation cannot be trigger before auction ends.", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
        dai,
      } = testEnv;

      // drop BAYC price to liquidation levels (HF = 0.6)
      await changePriceAndValidate(bayc, "8");

      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );
      const {startTime, tickLength} = await pool.getAuctionData(
        nBAYC.address,
        0
      );
      await advanceBlock(
        startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
      );

      // borrower Repays 10k DAI (HF = 2.5)
      await repayAndValidate(dai, "10000", borrower);

      // try to liquidate the NFT
      await expect(
        pool
          .connect(liquidator.signer)
          .liquidateERC721(
            bayc.address,
            borrower.address,
            0,
            parseEther("24").toString(),
            false,
            {gasLimit: 5000000}
          )
      ).revertedWith(ProtocolErrors.ERC721_HEALTH_FACTOR_NOT_BELOW_THRESHOLD);
      expect(await nBAYC.balanceOf(borrower.address)).to.be.equal(3);
    });

    it("TC-auction-liquidation-14 Auction cannot be ended if not started", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
      } = testEnv;

      // try to end auction
      await expect(
        pool
          .connect(liquidator.signer)
          .endAuction(borrower.address, bayc.address, 0)
      ).to.be.revertedWith(ProtocolErrors.AUCTION_NOT_STARTED);
    });

    it("TC-auction-liquidation-15 When ERC721 HF<1, ERC721 with TokenID 0 can normally start Auction", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
      } = testEnv;

      // drop BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");

      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );

      const {
        startTime,
        asset,
        tokenId,
        currentPriceMultiplier,
        maxPriceMultiplier,
      } = await pool.getAuctionData(nBAYC.address, 0);

      expect(startTime).to.be.gt(0);
      expect(asset).to.be.eq(bayc.address);
      expect(tokenId).to.be.eq(0);
      expect(currentPriceMultiplier).to.be.eq(maxPriceMultiplier);
      expect(await nBAYC.isAuctioned(0)).to.be.true;
    });

    it("TC-auction-liquidation-16 In the Auction process, ERC721 cannot Withdraw", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
      } = testEnv;

      // drop BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");

      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );

      const {startTime} = await pool.getAuctionData(nBAYC.address, 0);
      expect(startTime).to.be.gt(0);

      const isAuctioned = await nBAYC.isAuctioned(0);
      expect(isAuctioned).to.be.true;

      //Restore the price of BAYC so that ERC721 HF>1.5
      await changePriceAndValidate(bayc, "101");

      await expect(
        pool
          .connect(borrower.signer)
          .withdrawERC721(bayc.address, [0], borrower.address, {
            gasLimit: 5000000,
          })
      ).to.be.revertedWith(ProtocolErrors.TOKEN_IN_AUCTION);
    });

    it("TC-auction-liquidation-17 Auction is enabled in reserve. Auction price is used in liquidation, not floor or atomic price", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
        configurator,
      } = testEnv;

      await waitForTx(
        await configurator.setAuctionRecoveryHealthFactor("1500000000000000000")
      );

      // drop BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");

      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );

      const {startTime, tickLength} = await pool.getAuctionData(
        nBAYC.address,
        0
      );

      // prices drops to ~1.5 floor price
      await advanceBlock(
        startTime.add(tickLength.mul(BigNumber.from(30))).toNumber()
      );

      const {currentPriceMultiplier} = await pool.getAuctionData(
        nBAYC.address,
        0
      );

      expect(currentPriceMultiplier.toString()).to.be.equal(
        "1500000000000000000"
      );
      await pool
        .connect(liquidator.signer)
        .liquidateERC721(
          bayc.address,
          borrower.address,
          0,
          parseEther("12").toString(),
          false,
          {gasLimit: 5000000}
        );
      expect(await nBAYC.balanceOf(borrower.address)).to.be.equal(2);
    });

    it("TC-auction-liquidation-20 The default value of Account AuctionValidityTime is 0", async () => {
      const {
        users: [borrower],
        pool,
      } = testEnv;

      expect(
        (await pool.getUserConfiguration(borrower.address)).auctionValidityTime
      ).to.be.equal(0);
    });

    it("TC-auction-liquidation-21 ERC721 HF<1.5,can't Update AuctionValidityTime", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        poolDataProvider,
      } = testEnv;

      // drop BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");
      await pool
        .connect(liquidator.signer)
        .startAuction(borrower.address, bayc.address, 0);

      await expect(
        pool.connect(borrower.signer).setAuctionValidityTime(borrower.address)
      ).revertedWith(ProtocolErrors.ERC721_HEALTH_FACTOR_NOT_ABOVE_THRESHOLD);

      const {auctionValidityTime} = await pool
        .connect(poolDataProvider.address)
        .getUserConfiguration(borrower.address);
      expect(auctionValidityTime).to.be.equal(0);
    });

    it("TC-auction-liquidation-22 ERC721 HF>=1.5,can Update AuctionValidityTime", async () => {
      const {
        users: [borrower],
        pool,
        poolDataProvider,
      } = testEnv;

      await waitForTx(
        await pool
          .connect(borrower.signer)
          .setAuctionValidityTime(borrower.address)
      );
      const {auctionValidityTime} = await pool
        .connect(poolDataProvider.address)
        .getUserConfiguration(borrower.address);

      expect(auctionValidityTime).to.be.gt(0);
    });

    it("TC-auction-liquidation-23 After Updating AuctionValidityTime, all ERC721 in the previous Auction are ended.", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
      } = testEnv;

      // drop BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");

      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );

      const {startTime} = await pool.getAuctionData(nBAYC.address, 0);

      expect(startTime).to.be.gt(0);
      expect(await nBAYC.isAuctioned(0)).to.be.true;

      //Restore the price of BAYC so that ERC721 HF>1.5
      await changePriceAndValidate(bayc, "101");
      await waitForTx(
        await pool
          .connect(borrower.signer)
          .setAuctionValidityTime(borrower.address)
      );
      expect(await nBAYC.isAuctioned(0)).to.be.false;
    });

    it("TC-auction-liquidation-24 ERC721 HF>=1.5. Update AuctionValidityTime is not operated. For ERC721 with Auction enabled, EndAuction is not operated. When ERC721 HF<1.5, this ERC721 can still be liquidated", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
      } = testEnv;

      // drop BAYC price to liquidation levels (HF = 0.6)
      await changePriceAndValidate(bayc, "8");

      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );

      // price increases have no effect on auction status
      await changePriceAndValidate(bayc, "101");

      await changePriceAndValidate(bayc, "8");

      // try to liquidate the NFT
      await pool
        .connect(liquidator.signer)
        .liquidateERC721(
          bayc.address,
          borrower.address,
          0,
          parseEther("24").toString(),
          false,
          {gasLimit: 5000000}
        );

      //There are three of them, one of them is liquidated, and only two are left
      expect(await nBAYC.balanceOf(borrower.address)).to.be.lt(3);
    });

    it("TC-auction-liquidation-25 ERC721 HF>=1.5. Instead of running Update AuctionValidityTime, run EndAuction. When ERC721 HF<1.5, this ERC721 cannot be liquidated", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
      } = testEnv;

      // drop BAYC price to liquidation levels (HF = 0.6)
      await changePriceAndValidate(bayc, "8");

      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );

      await changePriceAndValidate(bayc, "101");

      // end auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .endAuction(borrower.address, bayc.address, 0)
      );

      await changePriceAndValidate(bayc, "8");

      // try to liquidate the NFT,failure of liquidation
      await expect(
        pool
          .connect(liquidator.signer)
          .liquidateERC721(
            bayc.address,
            borrower.address,
            0,
            parseEther("24").toString(),
            false,
            {gasLimit: 5000000}
          )
      ).revertedWith(ProtocolErrors.AUCTION_NOT_STARTED);

      expect(await nBAYC.balanceOf(borrower.address)).to.be.equal(3);
    });

    it("TC-auction-liquidation-26 ERC721 HF>=1.5. Instead of running Update AuctionValidityTime, run EndAuction. When ERC721 HF<1, Auction is turned on again, this ERC721 can be liquidated", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
      } = testEnv;

      // drop BAYC price to liquidation levels (HF = 0.6)
      await changePriceAndValidate(bayc, "8");

      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );

      await changePriceAndValidate(bayc, "101");

      // end auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .endAuction(borrower.address, bayc.address, 0)
      );

      await changePriceAndValidate(bayc, "8");

      // start auction again
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );

      // try to liquidate the NFT
      await pool
        .connect(liquidator.signer)
        .liquidateERC721(
          bayc.address,
          borrower.address,
          0,
          parseEther("24").toString(),
          false,
          {gasLimit: 5000000}
        );

      //There are three of them, one of them is liquidated, and only two are left
      expect(await nBAYC.balanceOf(borrower.address)).to.be.lt(3);
    });

    it("TC-auction-liquidation-27 ERC721 HF>=1.5, Update AuctionValidityTime, not EndAuction. When ERC721 HF<1, Auction is not enabled again. This ERC721 cannot be liquidated", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
      } = testEnv;

      // drop BAYC price to liquidation levels (HF = 0.6)
      await changePriceAndValidate(bayc, "8");

      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );

      await changePriceAndValidate(bayc, "101");

      // end auction
      await pool
        .connect(borrower.signer)
        .setAuctionValidityTime(borrower.address);

      await changePriceAndValidate(bayc, "8");

      // try to liquidate the NFT,failure of liquidation
      await expect(
        pool
          .connect(liquidator.signer)
          .liquidateERC721(
            bayc.address,
            borrower.address,
            0,
            parseEther("24").toString(),
            false,
            {gasLimit: 5000000}
          )
      ).revertedWith(ProtocolErrors.AUCTION_NOT_STARTED);
      expect(await nBAYC.balanceOf(borrower.address)).to.be.equal(3);
    });

    it("TC-auction-liquidation-28 If ERC721 HF>=1.5, run Update AuctionValidityTime but not EndAuction. When ERC721 HF<1, StartAuction is started again and this ERC721 can be liquidated", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
      } = testEnv;

      // drop BAYC price to liquidation levels (HF = 0.6)
      await changePriceAndValidate(bayc, "8");

      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );

      await changePriceAndValidate(bayc, "101");

      // end auction
      await pool
        .connect(borrower.signer)
        .setAuctionValidityTime(borrower.address);

      await changePriceAndValidate(bayc, "8");

      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );
      // try to liquidate the NFT
      await pool
        .connect(liquidator.signer)
        .liquidateERC721(
          bayc.address,
          borrower.address,
          0,
          parseEther("24").toString(),
          false,
          {gasLimit: 5000000}
        );
      expect(await nBAYC.balanceOf(borrower.address)).to.be.lt(3);
    });

    it("TC-auction-liquidation-29 Liquidator tries to start auction again (should be reverted)", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
      } = testEnv;

      await changePriceAndValidate(bayc, "8");

      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );

      // start auction again
      await expect(
        pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      ).to.be.revertedWith(ProtocolErrors.AUCTION_ALREADY_STARTED);
    });

    it("TC-auction-liquidation-30 Liquidator with a small amount of WETH to swap ERC721 (should be reverted)", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
      } = testEnv;

      await changePriceAndValidate(bayc, "8");

      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );

      // try to liquidate use a small amount of money
      await expect(
        pool
          .connect(liquidator.signer)
          .liquidateERC721(
            bayc.address,
            borrower.address,
            0,
            parseEther("4").toString(),
            false,
            {gasLimit: 5000000}
          )
      ).revertedWith(ProtocolErrors.LIQUIDATION_AMOUNT_NOT_ENOUGH);
    });

    it("TC-auction-liquidation-31 When validity time is set, auction will be invalidated, transfer the NFT will reset the auction state", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
      } = testEnv;
      // decrease BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");
      // HF = (0.8 * 8 + 5000 * 0.000908578801039414 * 0.9) / (15000 * 0.000908578801039414) = 0.76959786666666674336
      // ERC721 HF = (0.8 * 8) / (15000 * 0.000908578801039414 - 5000 * 0.000908578801039414) = 0.70439680000000011504

      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );
      expect(await nBAYC.isAuctioned(0)).to.be.true;

      // resume price
      await changePriceAndValidate(bayc, "101");

      // set BAYC#1 as collateral so that BAYC#0 can be transferred out
      await switchCollateralAndValidate(borrower, bayc, true, 1);

      await waitForTx(
        await pool
          .connect(borrower.signer)
          .setAuctionValidityTime(borrower.address, {
            gasLimit: 5000000,
          })
      );

      expect(await nBAYC.isAuctioned(0)).to.be.false;

      await waitForTx(
        await nBAYC
          .connect(borrower.signer)
          .transferFrom(borrower.address, liquidator.address, "0", {
            gasLimit: 5000000,
          })
      );

      expect(await nBAYC.isAuctioned(0)).to.be.false;
    });

    it("TC-auction-liquidation-32 When validity time is set, auction will be invalidated, withdraw the NFT will reset the auction state", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
      } = testEnv;
      // decrease BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");
      // start auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );
      expect(await nBAYC.isAuctioned(0)).to.be.true;

      // resume price
      await changePriceAndValidate(bayc, "101");

      // set BAYC#1 as collateral so that BAYC#0 can be withdrawn
      await switchCollateralAndValidate(borrower, bayc, true, 1);

      await waitForTx(
        await pool
          .connect(borrower.signer)
          .setAuctionValidityTime(borrower.address, {
            gasLimit: 5000000,
          })
      );

      expect(await nBAYC.isAuctioned(0)).to.be.false;

      await waitForTx(
        await pool
          .connect(borrower.signer)
          .withdrawERC721(bayc.address, ["0"], borrower.address, {
            gasLimit: 5000000,
          })
      );

      expect(await nBAYC.isAuctioned(0)).to.be.false;
    });
  });
});
