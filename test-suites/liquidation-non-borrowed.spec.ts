import {expect} from "chai";
import {
  getAggregator,
  getParaSpaceOracle,
} from "../deploy/helpers/contracts-getters";
import {
  assertAlmostEqual,
  borrowAndValidate,
  changePriceAndValidate,
  liquidateAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
} from "./helpers/validated-steps";
import {advanceBlock, waitForTx} from "../deploy/helpers/misc-utils";
import {BigNumber} from "ethers";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {assert} from "console";
import {TestEnv} from "./helpers/make-suite";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {MAX_UINT_AMOUNT, oneEther} from "../deploy/helpers/constants";
import {ProtocolErrors} from "../deploy/helpers/types";
import "./helpers/utils/wadraymath";
import {parseUnits} from "ethers/lib/utils";

describe("ERC721 Liquidation - non-borrowed token", () => {
  let testEnv: TestEnv;

  const {
    INVALID_HF,
    SPECIFIED_CURRENCY_NOT_BORROWED_BY_USER,
    HEALTH_FACTOR_NOT_BELOW_THRESHOLD,
  } = ProtocolErrors;

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

    // NFT HF < 1 borrower's NFT becomes eligible for liquidation
    await changePriceAndValidate(bayc, "8");

    // start auction
    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .startAuction(borrower.address, bayc.address, 0)
    );
    const {startTime, tickLength} = await pool.getAuctionData(nBAYC.address, 0);
    await advanceBlock(
      startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
    );

    const result = await liquidateAndValidate(
      bayc,
      weth,
      "8",
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
    //assert isUsingAsCollateral status correct
    expect(before.isUsingAsCollateral).to.be.false;
    expect(after.isUsingAsCollateral).to.be.true;
    //assert ptoken balance of liquidation asset
    assertAlmostEqual(
      after.borrowerLiquidationPTokenBalance,
      before.isAuctioned
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

  it("liquidates ERC-20 with non-borrowed token is not allowed", async () => {
    const {
      dai,
      usdc,
      weth,
      users: [depositor, borrower, liquidator],
      pool,
    } = testEnv;

    //mints DAI to depositor
    await dai
      .connect(depositor.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "1000"));

    //approve protocol to access depositor wallet
    await dai.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT);

    //user 1 deposits DAI
    const amountDAItoDeposit = await convertToCurrencyDecimals(
      dai.address,
      "1000"
    );
    await pool
      .connect(depositor.signer)
      .supply(dai.address, amountDAItoDeposit, depositor.address, "0");

    const amountETHtoDeposit = await convertToCurrencyDecimals(
      weth.address,
      "0.3"
    );

    //mints WETH to borrower
    await weth.connect(borrower.signer)["mint(uint256)"](amountETHtoDeposit);

    //approve protocol to access borrower wallet
    await weth.connect(borrower.signer).approve(pool.address, MAX_UINT_AMOUNT);

    //user 2 deposits WETH
    await pool
      .connect(borrower.signer)
      .supply(weth.address, amountETHtoDeposit, borrower.address, "0");

    //user 2 borrows
    const userGlobalData = await pool.getUserAccountData(borrower.address);

    const daiPrice = await (await getParaSpaceOracle())
      .connect(borrower.address)
      .getAssetPrice(dai.address);

    const amountDAIToBorrow = await convertToCurrencyDecimals(
      dai.address,
      userGlobalData.availableBorrowsBase
        .div(daiPrice.toString())
        .percentMul(9500)
        .toString()
    );
    await pool
      .connect(borrower.signer)
      .borrow(dai.address, amountDAIToBorrow, "0", borrower.address);

    const userGlobalDataAfterBorrow = await pool.getUserAccountData(
      borrower.address
    );

    expect(userGlobalDataAfterBorrow.currentLiquidationThreshold).to.be.equal(
      8050,
      "Invalid liquidation threshold"
    );

    //someone tries to liquidate user 2
    await expect(
      pool.liquidateERC20(weth.address, dai.address, borrower.address, 1, true)
    ).to.be.revertedWith(HEALTH_FACTOR_NOT_BELOW_THRESHOLD);

    await changePriceAndValidate(dai, daiPrice.percentMul(12000).toString());

    const userGlobalDataAfterPriceChange = await pool.getUserAccountData(
      borrower.address
    );

    expect(userGlobalDataAfterPriceChange.healthFactor).to.be.lt(
      oneEther,
      INVALID_HF
    );

    //user 2 tries to borrow
    await expect(
      pool
        .connect(liquidator.signer)
        .liquidateERC20(
          weth.address,
          usdc.address,
          borrower.address,
          parseUnits("20000", 18),
          false
        )
    ).to.be.revertedWith(SPECIFIED_CURRENCY_NOT_BORROWED_BY_USER);
  });
});
