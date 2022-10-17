import {expect} from "chai";
import {getMockAggregator} from "../deploy/helpers/contracts-getters";
import {TestEnv} from "./helpers/make-suite";
import {
  borrowAndValidate,
  changePriceAndValidate,
  liquidateAndValidate,
  liquidateAndValidateReverted,
  supplyAndValidate,
  switchCollateralAndValidate,
  withdrawAndValidate,
} from "./helpers/validated-steps";
import {snapshot} from "./helpers/snapshot-manager";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {ZERO_ADDRESS} from "../deploy/helpers/constants";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";

let snapthotId: string;

describe("Liquidation Tests", () => {
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

    // Liquidator deposits 100k DAI and 10 wETH
    await supplyAndValidate(weth, "10", liquidator, true, "1000");
    await supplyAndValidate(dai, "100000", liquidator, true, "200000");

    // Borrower borrows 15k DAI
    await borrowAndValidate(dai, "15000", borrower);
  });

  beforeEach("Take Blockchain Snapshot", async () => {
    snapthotId = await snapshot.take();
  });

  afterEach("Revert Blockchain to Snapshot", async () => {
    await snapshot.revert(snapthotId);
  });

  it("Liquidator tries to liquidate ERC-20 on a healthy position [HF ~ 1.0 - 1.1] (should be reverted)", async () => {
    const {
      users: [borrower, liquidator],
      dai,
      bayc,
    } = testEnv;

    // drop BAYC price to near liquidation limit (HF ~ 1.0 - 1.1)
    await changePriceAndValidate(bayc, "15");

    await liquidateAndValidateReverted(
      dai,
      dai,
      "1000",
      liquidator,
      borrower,
      false,
      ProtocolErrors.HEALTH_FACTOR_NOT_BELOW_THRESHOLD
    );
  });

  it("Liquidator attempts to liquidate ERC-721 first (should be reverted)", async () => {
    const {
      users: [borrower, liquidator],
      bayc,
      dai,
    } = testEnv;

    // BAYC price drops enough so that borrower becomes eligible for liquidation
    await changePriceAndValidate(bayc, "12");

    await liquidateAndValidateReverted(
      bayc,
      dai,
      "12",
      liquidator,
      borrower,
      false,
      ProtocolErrors.AUCTION_NOT_STARTED
    );
  });

  it("Liquidator partially liquidates ERC-20 - receives asset", async () => {
    const {
      users: [borrower, liquidator],
      bayc,
      dai,
    } = testEnv;

    // BAYC price drops enough so that borrower becomes eligible for liquidation
    await changePriceAndValidate(bayc, "12");

    await liquidateAndValidate(dai, dai, "1000", liquidator, borrower, false);
  });

  it("Liquidator fully liquidates ERC-20 - receives pToken", async () => {
    const {
      users: [borrower, liquidator],
      dai,
      bayc,
    } = testEnv;

    // BAYC price drops enough so that borrower becomes eligible for liquidation
    await changePriceAndValidate(bayc, "12");

    await liquidateAndValidate(dai, dai, "40000", liquidator, borrower, true);
  });

  it("Liquidator liquidates ERC-721 (pays debt partially) with borrowed token - gets nToken", async () => {
    const {
      users: [borrower, liquidator],
      nBAYC,
      configurator,
      bayc,
      dai,
    } = testEnv;

    // borrower places another 2 NFTs in collateral and borrows 60k DAI
    await switchCollateralAndValidate(borrower, bayc, true, 1);
    await switchCollateralAndValidate(borrower, bayc, true, 2);

    await borrowAndValidate(dai, "60000", borrower);

    // drop NFT price
    await changePriceAndValidate(bayc, "10");

    await waitForTx(
      await configurator.setReserveAuctionStrategyAddress(
        bayc.address,
        ZERO_ADDRESS
      )
    );

    // verify NFT is available for auction
    expect(await nBAYC.isAuctioned(1));

    await liquidateAndValidate(
      bayc,
      dai,
      "80000",
      liquidator,
      borrower,
      true,
      1
    );

    // verify NFT is no longer available for auction
    expect(await nBAYC.isAuctioned(1)).not;
  });

  it("Liquidator liquidates ERC-721 (pays full debt) with borrowed token - gets NFT", async () => {
    const {
      users: [borrower, liquidator],
      nBAYC,
      bayc,
      dai,
      configurator,
    } = testEnv;

    // drop BAYC price
    await changePriceAndValidate(bayc, "5");

    await waitForTx(
      await configurator.setReserveAuctionStrategyAddress(
        bayc.address,
        ZERO_ADDRESS
      )
    );

    // verify NFT is available for auction
    expect(await nBAYC.isAuctioned(0));

    await liquidateAndValidate(
      bayc,
      dai,
      "80000",
      liquidator,
      borrower,
      false,
      0
    );

    // verify NFT is no longer available for auction
    expect(await nBAYC.isAuctioned(0)).not;
  });

  it("Liquidate borrower with 1 NFT and multiple borrow position", async () => {
    const {
      users: [borrower, liquidator],
      bayc,
      nBAYC,
      dai,
      weth,
      configurator,
    } = testEnv;

    // leave only 1 NFT
    await withdrawAndValidate(bayc, "1", borrower, 1);
    await withdrawAndValidate(bayc, "1", borrower, 2);

    // borrow more ERC-20
    await borrowAndValidate(dai, "150", borrower);
    await borrowAndValidate(weth, "1", borrower);

    // drop BAYC price
    await changePriceAndValidate(bayc, "5");

    await waitForTx(
      await configurator.setReserveAuctionStrategyAddress(
        bayc.address,
        ZERO_ADDRESS
      )
    );

    await liquidateAndValidate(
      bayc,
      dai,
      "80000",
      liquidator,
      borrower,
      false,
      0
    );

    expect((await nBAYC.getAuctionData(0)).startTime).to.be.eq(0);
  });

  it("Liquidate borrower with multiple NFTs and 1 borrow position", async () => {
    const {
      users: [borrower, liquidator],
      configurator,
      dai,
      bayc,
      nBAYC,
    } = testEnv;

    // use all BAYCs as collateral
    await switchCollateralAndValidate(borrower, bayc, true, 1);
    await switchCollateralAndValidate(borrower, bayc, true, 2);

    // drop BAYC price
    await changePriceAndValidate(bayc, "1");

    await waitForTx(
      await configurator.setReserveAuctionStrategyAddress(
        bayc.address,
        ZERO_ADDRESS
      )
    );

    await liquidateAndValidate(
      bayc,
      dai,
      "80000",
      liquidator,
      borrower,
      false,
      0
    );

    expect((await nBAYC.getAuctionData(0)).startTime).to.be.eq(0);
  });

  it("Liquidate borrower with multiple NFTs and multiple borrow positions", async () => {
    const {
      users: [borrower, liquidator],
      configurator,
      bayc,
      nBAYC,
      dai,
      weth,
    } = testEnv;

    // use all BAYCs as collateral
    await switchCollateralAndValidate(borrower, bayc, true, 1);
    await switchCollateralAndValidate(borrower, bayc, true, 2);

    // borrow more ERC-20
    await borrowAndValidate(dai, "150", borrower);
    await borrowAndValidate(weth, "1", borrower);

    // drop BAYC price
    await changePriceAndValidate(bayc, "2");

    await waitForTx(
      await configurator.setReserveAuctionStrategyAddress(
        bayc.address,
        ZERO_ADDRESS
      )
    );

    await liquidateAndValidate(
      bayc,
      dai,
      "80000",
      liquidator,
      borrower,
      false,
      0
    );

    expect((await nBAYC.getAuctionData(0)).startTime).to.be.eq(0);
  });
});
