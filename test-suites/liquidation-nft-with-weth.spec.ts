import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {
  getMockAggregator,
  getParaSpaceOracle,
} from "../deploy/helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {
  advanceTimeAndBlock,
  DRE,
  evmRevert,
  evmSnapshot,
  waitForTx,
} from "../deploy/helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {getUserData} from "./helpers/utils/helpers";
import {
  borrowAndValidate,
  changePriceAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";

describe("Liquidation Auction", () => {
  let testEnv: TestEnv;
  let snapShot: string;

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
    await supplyAndValidate(bayc, "1", borrower, true);

    // Liquidator deposits 100k DAI and 100 wETH
    await supplyAndValidate(weth, "100", liquidator, true, "1000");
    await supplyAndValidate(dai, "100000", liquidator, true, "200000");
  });

  beforeEach(async () => {
    snapShot = await evmSnapshot();
  });

  afterEach(async () => {
    await evmRevert(snapShot);
  });

  it("liquidation without any repay,only a swap from nbayc to pweth", async () => {
    const {
      users: [borrower, liquidator],
      pool,
      bayc,
      nBAYC,
      dai,
      weth,
      protocolDataProvider,
    } = testEnv;

    // 10k DAI ~= 9 ETH
    await borrowAndValidate(dai, "10000", borrower);

    // drop BAYC price to liquidation levels (HF = 0.6)
    await changePriceAndValidate(bayc, "8");

    // start auction
    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .startAuction(borrower.address, bayc.address, 0)
    );
    const {startTime, tickLength} = await pool.getAuctionData(nBAYC.address, 0);
    await advanceTimeAndBlock(
      startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
    );
    const auctionDataAfter = await pool.getAuctionData(nBAYC.address, 0);
    const actualPriceMultiplier = auctionDataAfter.currentPriceMultiplier.lte(
      auctionDataAfter.minPriceMultiplier
    )
      ? auctionDataAfter.minPriceMultiplier
      : auctionDataAfter.currentPriceMultiplier;
    let baycPrice = await (await getParaSpaceOracle())
      .connect(borrower.address)
      .getAssetPrice(bayc.address);
    baycPrice = baycPrice
      .wadMul(actualPriceMultiplier)
      .wadDiv(DRE.ethers.utils.parseUnits("1", 18));
    // liquidate the NFT
    expect(
      await pool
        .connect(liquidator.signer)
        .liquidationERC721(
          bayc.address,
          borrower.address,
          0,
          await convertToCurrencyDecimals(weth.address, "10"),
          false
        )
    );

    const borrowerWethReserveDataAfter = await getUserData(
      pool,
      protocolDataProvider,
      weth.address,
      borrower.address
    );
    //assert nbayc fully swap to pweth
    expect(borrowerWethReserveDataAfter.currentPTokenBalance).to.be.eq(
      baycPrice
    );
  });
});
