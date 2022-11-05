import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {parseEther} from "ethers/lib/utils";
import {ZERO_ADDRESS} from "../deploy/helpers/constants";
import {getMockAggregator} from "../deploy/helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {advanceBlock, waitForTx} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {snapshot} from "./helpers/snapshot-manager";
import {
  borrowAndValidate,
  changePriceAndValidate,
  liquidateAndValidate,
  repayAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
} from "./helpers/validated-steps";

describe("Liquidation Auction", () => {
  let snapthotId: string;
  let testEnv: TestEnv;

  before("Setup Borrower and Liquidator positions", async () => {
    testEnv = await loadFixture(testEnvFixture);
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

    // Liquidator deposits 100k DAI and 100 wETH
    await supplyAndValidate(weth, "100", liquidator, true, "1000");
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

    it("TC-auction-1:Auction cannot be started if user health factor is above 1", async () => {
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

    it("TC-auction-2:UniswapV3 asset cannot be auctionable", async () => {
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

    it("TC-auction-3:Auction cannot be ended if not started", async () => {
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

    it("TC-auction-4:Auction cannot be ended if HF < RECOVERY_HF", async () => {
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
      await advanceBlock(
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

    it("TC-auction-5:Auction can be ended if HF > RECOVERY_HF", async () => {
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
      await advanceBlock(
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

    it("TC-auction-6:Auction can be manually ended if HF > RECOVERY_HF", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        nBAYC,
        dai,
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

      const {startTime, tickLength} = await pool.getAuctionData(
        nBAYC.address,
        0
      );
      await advanceBlock(
        startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
      );

      // as borrower repay 5k DAI (HF = 1.176)
      await repayAndValidate(dai, "5000", borrower);

      // and then rise BAYC price to above recovery limit (HF > 1.5)
      await changePriceAndValidate(bayc, "20");

      // manually end auction
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .endAuction(borrower.address, bayc.address, 0)
      );

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

    it("TC-auction-7:Cannot execute liquidation if NFT is not in auction", async () => {
      const {
        users: [borrower, liquidator],
        bayc,
        weth,
      } = testEnv;

      // drop BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");

      // try to liquidate the NFT
      await expect(
        liquidateAndValidate(bayc, weth, "7.3", liquidator, borrower, false, 0)
      ).to.be.revertedWith(ProtocolErrors.AUCTION_NOT_STARTED);
    });

    it("TC-auction-8:If an auction is started, but user repays and HF >=1, but < RECOVERY_HF, liquidation can be performed", async () => {
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
      expect(
        await pool
          .connect(liquidator.signer)
          .liquidationERC721(
            bayc.address,
            borrower.address,
            0,
            await convertToCurrencyDecimals(dai.address, "10000"),
            false
          )
      );
    });

    it("TC-auction-9:If an auction is started, but user repays and HF >=1, but < RECOVERY_HF, liquidation can be performed", async () => {
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
          .liquidationERC721(
            bayc.address,
            borrower.address,
            0,
            await convertToCurrencyDecimals(dai.address, "10000"),
            false
          )
      ).to.be.revertedWith(
        ProtocolErrors.ERC721_HEALTH_FACTOR_NOT_BELOW_THRESHOLD
      );
    });

    it("TC-auction-10:Liquidator can liquidate ERC-721 without auction enabled", async () => {
      const {
        users: [borrower, liquidator],
        pool,
        bayc,
        configurator,
      } = testEnv;

      // drop BAYC price to liquidation levels
      await changePriceAndValidate(bayc, "8");

      // actualLiquidationAmount: 8 / 1 / 1.05 = 7.6190476190476190476

      // disable auction first to test original liquidation
      await waitForTx(
        await configurator.setReserveAuctionStrategyAddress(
          bayc.address,
          ZERO_ADDRESS
        )
      );

      // drop BAYC price to liquidation levels (HF = 0.6)
      await changePriceAndValidate(bayc, "8");

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
      // liquidationAmount: 7.5
      // actualLiquidationAmount: 7.6190476190476190476

      expect(
        await pool
          .connect(liquidator.signer)
          .liquidationERC721(
            bayc.address,
            borrower.address,
            0,
            parseEther("20").toString(),
            false
          )
      );
    });
  });
});
