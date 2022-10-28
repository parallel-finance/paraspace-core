import {expect} from "chai";
import {getMockAggregator} from "../deploy/helpers/contracts-getters";
import {
  assertAlmostEqual,
  borrowAndValidate,
  changePriceAndValidate,
  liquidateAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
} from "./helpers/validated-steps";
import {setBlocktime, waitForTx} from "../deploy/helpers/misc-utils";
import {BigNumber} from "ethers";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {assert} from "console";
import {TestEnv} from "./helpers/make-suite";
import "./helpers/utils/wadraymath";

describe("ERC721 Liquidation - non-borrowed token", () => {
  let testEnv: TestEnv;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
  });

  it("Liquidator liquidates the ERC-721 with non-borrowed token - gets NFT", async () => {
    const {
      users: [borrower, liquidator],
      pool,
      bayc,
      nBAYC,
      weth,
      dai,
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

    // NFT HF < 1 borrower's NFT becomes eligible for liquidation
    await changePriceAndValidate(bayc, "8");

    // start auction
    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .startAuction(borrower.address, bayc.address, 0)
    );
    const {startTime, tickLength} = await pool.getAuctionData(nBAYC.address, 0);
    await setBlocktime(
      startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
    );
    expect((await nBAYC.getAuctionData(0)).startTime).to.be.gt(0);

    const expectedAuctionData = await pool
      .connect(liquidator.signer)
      .getAuctionData(nBAYC.address, 0);

    console.log(expectedAuctionData);

    const result = await liquidateAndValidate(
      bayc,
      weth,
      "1000",
      liquidator,
      borrower,
      false,
      0
    );

    const {before, after} = result;
    //liquidator supply liquidation asset on behalf of borrower to get his nft token
    assert(
      before.liquidatorLiquidationAssetBalance
        .sub(after.liquidatorLiquidationAssetBalance)
        .eq(after.borrowerLiquidationPTokenBalance)
    );

    //assert liquidator actually get the nft
    assert(
      after.liquidatorCollateralTokenBalance >
        before.liquidatorCollateralTokenBalance
    );
    //assert borrowing status correct
    expect(before.isLiquidationAssetBorrowedPerConfig).to.be.false;
    expect(after.isLiquidationAssetBorrowedPerConfig).to.be.false;
    //assert isUsingAsCollateral status correct
    expect(before.isUsingAsCollateral).to.be.false;
    expect(after.isUsingAsCollateral).to.be.true;
    //assert ptoken balance of liquidation asset
    assertAlmostEqual(
      after.borrowerLiquidationPTokenBalance,
      before.isAuctionStarted
        ? // since it is dificult to predict the price in auction case
          // we remove it from common validation logic to here
          before.liquidatorLiquidationAssetBalance.sub(
            after.liquidatorLiquidationAssetBalance
          )
        : before.borrowerLiquidationPTokenBalance.add(
            before.liquidationAssetPrice
          )
    );
  });
});
