import {expect} from "chai";
import {BigNumber} from "ethers";
import {parseEther} from "ethers/lib/utils";
import {ZERO_ADDRESS} from "../deploy/helpers/constants";
import {getMockAggregator} from "../deploy/helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {
  advanceBlock,
  setBlocktime,
  waitForTx,
} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {makeSuite} from "./helpers/make-suite";
import {snapshot} from "./helpers/snapshot-manager";
import {
  borrowAndValidate,
  changePriceAndValidate,
  liquidateAndValidate,
  repayAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
} from "./helpers/validated-steps";

makeSuite("Liquidation Auction", (testEnv) => {
  let snapthotId: string;

  before("Setup Borrower and Liquidator positions", async () => {
    const {
      users: [borrower, liquidator],
      bayc,
      dai,
      weth,
    } = testEnv;

    // assure asset prices for correct health factor calculations
    await changePriceAndValidate(bayc, "101");

    const daiAgg = await getMockAggregator(undefined, "DAI");
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
  });

  describe("Revert to snapshot on every step", () => {
    beforeEach("Take Blockchain Snapshot", async () => {
      snapthotId = await snapshot.take();
    });

    afterEach("Revert Blockchain to Snapshot", async () => {
      await snapshot.revert(snapthotId);
    });

    it("Auction cannot be started if user health factor is above 1", async () => {
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

    it("UniswapV3 asset cannot be auctionable", async () => {
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

    it("Auction cannot be ended if not started", async () => {
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

    it("Auction cannot be ended if HF < RECOVERY_HF", async () => {
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
      const {startTime, tickLength} = await pool.getAuctionData(
        nBAYC.address,
        0
      );
      await setBlocktime(
        startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
      );

      // rise BAYC price to near liquidation limit (HF ~ 1.0 - 1.1)
      await changePriceAndValidate(bayc, "15");

      // try to batch end auction
      await expect(
        pool.connect(liquidator.signer).setAuctionValidityTime(borrower.address)
      ).to.be.revertedWith(
        ProtocolErrors.ERC721_HEALTH_FACTOR_NOT_ABOVE_THRESHOLD
      );

      // try to end auction
      await expect(
        pool
          .connect(liquidator.signer)
          .endAuction(borrower.address, bayc.address, 0)
      ).to.be.revertedWith(
        ProtocolErrors.ERC721_HEALTH_FACTOR_NOT_ABOVE_THRESHOLD
      );
    });

    it("Auction can be ended if HF > RECOVERY_HF", async () => {
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
      const {startTime, tickLength} = await pool.getAuctionData(
        nBAYC.address,
        0
      );
      await setBlocktime(
        startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
      );

      // rise BAYC price to above recovery limit (HF > 1.5)
      await changePriceAndValidate(bayc, "20");

      // batch end auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .setAuctionValidityTime(borrower.address)
      );

      expect(
        (await pool.getUserConfiguration(borrower.address)).auctionValidityTime
      ).to.be.gt(0);

      expect(await nBAYC.isAuctioned(0)).to.be.false;

      const newAuctionData = await pool.getAuctionData(nBAYC.address, 0);
      expect(newAuctionData.startTime).to.be.eq(0);

      // cannot end auction again
      await expect(
        pool
          .connect(liquidator.signer)
          .endAuction(borrower.address, bayc.address, 0)
      ).to.be.revertedWith(ProtocolErrors.AUCTION_NOT_STARTED);
    });

    it("Cannot execute liquidation if NFT is not in auction", async () => {
      const {
        users: [borrower, liquidator],
        bayc,
        dai,
      } = testEnv;

      // drop BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");

      // try to liquidate the NFT
      await expect(
        liquidateAndValidate(bayc, dai, "80000", liquidator, borrower, false, 0)
      ).to.be.revertedWith(ProtocolErrors.AUCTION_NOT_STARTED);
    });

    it("If an auction is started, but user repays and HF >=1, but < RECOVERY_HF, liquidation can be performed", async () => {
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
      await setBlocktime(
        startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
      );

      // borrower Repays 5k DAI (HF = 1.176)
      await repayAndValidate(dai, "5000", borrower);

      // liquidate the NFT
      expect(
        await pool
          .connect(liquidator.signer)
          .liquidationERC721(
            bayc.address,
            dai.address,
            borrower.address,
            0,
            await convertToCurrencyDecimals(dai.address, "10000"),
            false
          )
      );
    });

    it("If an auction is started, but user repays and HF >=1, but < RECOVERY_HF, liquidation can be performed", async () => {
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
      await setBlocktime(
        startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
      );

      // borrower Repays 10k DAI (HF = 2.5)
      await repayAndValidate(dai, "10000", borrower);

      // try to liquidate the NFT
      await expect(
        pool
          .connect(liquidator.signer)
          .liquidationERC721(
            bayc.address,
            dai.address,
            borrower.address,
            0,
            await convertToCurrencyDecimals(dai.address, "10000"),
            false
          )
      ).to.be.revertedWith(
        ProtocolErrors.ERC721_HEALTH_FACTOR_NOT_BELOW_THRESHOLD
      );
    });

    it("Liquidator attempts to liquidate ERC-721 without auction enabled (should be reverted)", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        dai,
        configurator,
      } = testEnv;

      // drop BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");

      // collateralDiscountedPrice: 12 / 0.000908578801039414 / 1.05 = 12578.514285714287769 DAI

      // disable auction first to test original liquidation
      await waitForTx(
        await configurator.setReserveAuctionStrategyAddress(
          bayc.address,
          ZERO_ADDRESS
        )
      );

      // Liquidator
      //
      // collaterals:
      // DAI#100k
      // WETH#10
      //
      // wallet:
      // DAI#100k
      // WETH#990
      //
      // liquidationAmount: 12000000000000000000
      // collateralDiscountedPrice: 12578514285714287768609
      await expect(
        pool
          .connect(liquidator.signer)
          .liquidationERC721(
            bayc.address,
            dai.address,
            borrower.address,
            0,
            parseEther("12").toString(),
            false,
            {
              gasLimit: 5000000,
            }
          )
      ).to.be.revertedWith(ProtocolErrors.LIQUIDATION_AMOUNT_NOT_ENOUGH);
    });
  });

  describe("Do not revert to snapshot on every step", () => {
    it("Liquidator starts auction on BAYC#0", async () => {
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
    });

    it("BAYC#0 auction started", async () => {
      const {
        users: [borrower],
        nBAYC,
        poolDataProvider,
      } = testEnv;

      const {startTime} = await nBAYC.getAuctionData(0);
      const isAuctioned = await nBAYC.isAuctioned(0);
      expect(startTime).to.be.gt(0);
      expect(isAuctioned).to.be.true;

      const [[auctionData]] = await poolDataProvider.getNTokenData(
        borrower.address,
        [nBAYC.address],
        [[0, 1, 2]]
      );
      expect(auctionData.isAuctioned).to.be.true;
    });

    it("Liquidator tries to start auction on BAYC#0 again (should be reverted)", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
      } = testEnv;

      await expect(
        pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      ).to.be.revertedWith(ProtocolErrors.AUCTION_ALREADY_STARTED);
    });

    it("Borrower tries to end auction to avoid being liquidated - HF < 1(should be reverted)", async () => {
      const {
        users: [borrower],
        pool,
        bayc,
      } = testEnv;

      await expect(
        pool.connect(borrower.signer).setAuctionValidityTime(borrower.address)
      ).to.be.revertedWith(
        ProtocolErrors.ERC721_HEALTH_FACTOR_NOT_ABOVE_THRESHOLD
      );

      await expect(
        pool
          .connect(borrower.signer)
          .endAuction(borrower.address, bayc.address, 0)
      ).to.be.revertedWith(
        ProtocolErrors.ERC721_HEALTH_FACTOR_NOT_ABOVE_THRESHOLD
      );
    });

    it("Before liquidation BAYC price increased sharply", async () => {
      const agg = await getMockAggregator(undefined, "BAYC");
      await agg.updateLatestAnswer(parseEther("60").toString());

      // Borrower
      //
      // collaterals:
      // BAYC#0 = 0.3 * 60 ~= 18 ETH
      //
      // borrows:
      // DAI = (15000 - 1000 - (5000 - 1050) / 1.05) * 0.000908578801039414 ~= 9.3021162963559052379 ETH
      //
      // HF = (0.7 * 60) / (9.3021162963559052379) ~= 4.5151015813953495747
      // ERC721HF = uint256.max
    });

    it("Liquidator attempts to liquidate the ERC-721 - HF > RECOVERY_HF (should be reverted because of recoveryHealthFactor)", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        weth,
      } = testEnv;

      await expect(
        pool
          .connect(liquidator.signer)
          .liquidationERC721(
            bayc.address,
            weth.address,
            borrower.address,
            0,
            parseEther("36").toString(),
            false,
            {gasLimit: 5000000}
          )
      ).to.be.revertedWith(
        ProtocolErrors.ERC721_HEALTH_FACTOR_NOT_BELOW_THRESHOLD
      );
    });

    it("Borrower attempts to end auction using timestamp", async () => {
      const {
        users: [borrower],
        pool,
        nBAYC,
      } = testEnv;

      await waitForTx(
        await pool
          .connect(borrower.signer)
          .setAuctionValidityTime(borrower.address)
      );

      expect(await nBAYC.isAuctioned(0)).to.be.false;
    });

    it("BAYC price drops sharply back to 8ETH", async () => {
      const agg = await getMockAggregator(undefined, "BAYC");
      await agg.updateLatestAnswer(parseEther("8").toString());
    });

    it("Liquidator attempts to start auction again", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
      } = testEnv;

      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(borrower.address, bayc.address, 0)
      );

      expect(await nBAYC.isAuctioned(0)).to.be.true;
    });

    it("Admin decreased auction recovery health factor to be below the real HF, thus disabled the liquidation", async () => {
      const {configurator} = testEnv;

      await waitForTx(
        await configurator.setAuctionRecoveryHealthFactor("500000000000000000")
      );
    });

    it("Admin restores the auction recovery health factor, liquidator then liquidates the ERC-721 - gets NFT", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
        weth,
        configurator,
      } = testEnv;

      // Borrower
      //
      // collaterals:
      // BAYC#0 = 0.3 * 8 ~= 2.7 ETH
      //
      // borrows:
      // DAI = (15000 - 1000 - (5000 - 1050) / 1.05) * 0.000908578801039414 ~= 9.3021162963559052379 ETH
      //
      // HF = (0.7 * 8) / (9.3021162963559052379) ~= 0.60201354418604660996
      // ERC721HF = (0.7 * 8) / (9.3021162963559052379) ~= 0.60201354418604660996

      // collateralDiscountedPrice: 8 * 1.5 / 1 / 1 = 12 WETH
      await expect(
        pool
          .connect(liquidator.signer)
          .liquidationERC721(
            bayc.address,
            weth.address,
            borrower.address,
            0,
            parseEther("12").toString(),
            false
          )
      ).to.be.revertedWith(
        ProtocolErrors.ERC721_HEALTH_FACTOR_NOT_BELOW_THRESHOLD
      );

      await waitForTx(
        await configurator.setAuctionRecoveryHealthFactor("1500000000000000000")
      );

      const {startTime, tickLength} = await pool.getAuctionData(
        nBAYC.address,
        0
      );
      // prices drops to ~1.5 floor price
      await advanceBlock(
        startTime.add(tickLength.mul(BigNumber.from(30))).toNumber()
      );

      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .liquidationERC721(
            bayc.address,
            weth.address,
            borrower.address,
            0,
            parseEther("12").toString(),
            false
          )
      );
    });

    it("BAYC#0 auction ended automatically after liquidation", async () => {
      const {
        users: [borrower],
        nBAYC,
        poolDataProvider,
      } = testEnv;

      const {startTime} = await nBAYC.getAuctionData(0);
      const isAuctioned = await nBAYC.isAuctioned(0);
      expect(startTime).to.be.eq(0);
      expect(isAuctioned).to.be.false;

      const [[auctionData]] = await poolDataProvider.getNTokenData(
        borrower.address,
        [nBAYC.address],
        [[0, 1, 2]]
      );
      expect(auctionData.isAuctioned).to.be.false;
    });
  });
});
