import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {parseEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT, ONE_YEAR} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {advanceTimeAndBlock} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  borrowAndValidate,
  mintAndValidate,
  repayAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
} from "./helpers/validated-steps";

describe("pToken/debtToken Mint and Burn Event Accounting", () => {
  const firstDaiDeposit = "10000";
  const secondDaiDeposit = "20000";
  let accruedInterest = BigNumber.from(0);
  let testEnv: TestEnv;

  before("Initialize Depositors", async () => {
    testEnv = await loadFixture(testEnvFixture);
  });

  it("TC-erc20-repay-01 User 1 deposits 10K DAI and borrows 5K DAI", async () => {
    const {
      dai,
      users: [user1],
    } = testEnv;

    // User 1 - Deposit dai
    await supplyAndValidate(dai, firstDaiDeposit, user1, true);

    // User 1 - Borrow dai
    await borrowAndValidate(dai, "5000", user1);
  });

  it("TC-erc20-repay-02 User 2 has reached the clearing threshold", async () => {
    const {
      usdc,
      pool,
      users: [, user2],
    } = testEnv;
    // User 2 - Deposit usdc
    await supplyAndValidate(usdc, secondDaiDeposit, user2, true);

    // User 2 - Borrow usdc
    await borrowAndValidate(usdc, "15500", user2);

    // user1 - healthFactor value is between 1.1 - 1.0
    const healthFactor = (await pool.getUserAccountData(user2.address))
      .healthFactor;
    expect(healthFactor)
      .to.be.most(parseEther("1.1"))
      .to.be.least(parseEther("1.0"));
  });

  it("TC-erc20-repay-03 User 1 acquires share of borrower interest", async () => {
    const {
      pDai,
      users: [user1],
    } = testEnv;
    const pDaiBalanceBefore = await pDai.balanceOf(user1.address);

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    const pDaiBalanceAfter = await pDai.balanceOf(user1.address);
    expect(pDaiBalanceAfter).to.be.gt(pDaiBalanceBefore);

    accruedInterest = pDaiBalanceAfter.sub(pDaiBalanceBefore);
  });

  it("TC-erc20-repay-04 User 1 partially repays the accrued interest on borrowed DAI", async () => {
    const {
      users: [user1],
      dai,
    } = testEnv;

    await mintAndValidate(dai, firstDaiDeposit, user1);
    // User 1 - repay accrued interest
    await repayAndValidate(dai, "100", user1);
  });

  it("TC-erc20-repay-05 User 1 still acquires share of borrower interest, but now less", async () => {
    const {
      pDai,
      users: [user1],
    } = testEnv;
    const pDaiBalance = await pDai.balanceOf(user1.address);

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    const pDaiBalanceAfter = await pDai.balanceOf(user1.address);
    expect(pDaiBalanceAfter).to.be.gt(pDaiBalance);

    expect(pDaiBalanceAfter.sub(pDaiBalance)).to.be.lt(accruedInterest);
  });

  it("TC-erc20-repay-06 User 1 Repayment object is Other users", async () => {
    const {
      usdc,
      pool,
      users: [user1, user2],
    } = testEnv;
    const availableToBorrowBeforeRepay = (
      await pool.getUserAccountData(user2.address)
    ).availableBorrowsBase;
    const amount = await convertToCurrencyDecimals(usdc.address, "100");

    await mintAndValidate(usdc, "1000", user1);
    await usdc.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);

    // user 1 repay user 2 loan
    const repayTx = await pool
      .connect(user1.signer)
      .repay(usdc.address, amount, user2.address);
    await repayTx.wait();

    // User 2 - Available to borrow should have increased
    const availableToBorrowAfterRepay = (
      await pool.getUserAccountData(user2.address)
    ).availableBorrowsBase;

    expect(availableToBorrowAfterRepay).to.be.gt(availableToBorrowBeforeRepay);
  });

  it("TC-erc20-repay-07 User 1 fully repays the loan plus any accrued interest", async () => {
    const {
      dai,
      variableDebtDai,
      users: [user1],
      pool,
      pDai,
    } = testEnv;
    const pDaiBalance = await pDai.balanceOf(user1.address);
    console.log("pDaiBalance", pDaiBalance.toString());
    const availableToBorrowBeforeRepay = (
      await pool.getUserAccountData(user1.address)
    ).availableBorrowsBase;
    const daiBalanceBeforeRepay = await dai.balanceOf(user1.address);
    const debtBalanceBeforeRepay = await variableDebtDai.balanceOf(
      user1.address
    );

    // repay dai loan
    const repayTx = await pool
      .connect(user1.signer)
      .repay(dai.address, MAX_UINT_AMOUNT, user1.address);
    await repayTx.wait();

    // User 1 - Available to borrow should have increased
    const availableToBorrowAfterRepay = (
      await pool.getUserAccountData(user1.address)
    ).availableBorrowsBase;
    expect(availableToBorrowAfterRepay).to.be.gt(availableToBorrowBeforeRepay);

    // User 1 - Debt token balance should be 0
    const debtBalanceAfterRepay = await variableDebtDai.balanceOf(
      user1.address
    );
    expect(debtBalanceAfterRepay).to.be.equal(0);

    // User 1 - DAI balance should have decreased at least in the debtBalanceBeforeRepay amount
    const daiBalanceAfterRepay = await dai.balanceOf(user1.address);
    expect(daiBalanceAfterRepay).to.be.lte(
      daiBalanceBeforeRepay.sub(debtBalanceBeforeRepay)
    );
    const pDaiBalanceAfter = await pDai.balanceOf(user1.address);
    console.log("pDaiBalanceAfter", pDaiBalanceAfter.toString());
  });

  it("TC-erc20-repay-08 User 1 no longer acquires share of borrower interest", async () => {
    const {
      pDai,
      users: [user1],
    } = testEnv;
    const pDaiBalance = await pDai.balanceOf(user1.address);

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    const pDaiBalanceAfter = await pDai.balanceOf(user1.address);
    expect(pDaiBalanceAfter).to.be.equal(pDaiBalance);
  });

  it("TC-erc20-repay-09 User 1 removes the deposited DAI from collateral", async () => {
    const {
      users: [user1],
      dai,
    } = testEnv;

    await switchCollateralAndValidate(user1, dai, false);
  });

  it("TC-erc20-repay-10 User 2 Reaching the liquidation threshold, repay to make it recover health", async () => {
    const {
      usdc,
      pool,
      users: [, user2],
    } = testEnv;

    const healthFactor = (await pool.getUserAccountData(user2.address))
      .healthFactor;
    await repayAndValidate(usdc, "1000", user2);

    //user2 -  health factor should have improved
    const healthFactorAfter = (await pool.getUserAccountData(user2.address))
      .healthFactor;
    expect(healthFactorAfter).to.be.least(healthFactor);
  });

  it("TC-erc20-repay-11 User 3 deposits", async () => {
    const {
      dai,
      users: [, , user3],
    } = testEnv;

    // User 3 - Deposit dai
    await supplyAndValidate(dai, firstDaiDeposit, user3, true);
  });

  it("TC-erc20-repay-12 User 3 Borrow and repay in same block (should fail)", async () => {
    const {
      users: [, , user3],
      pool,
      dai,
    } = testEnv;

    const daiBalance = await dai.balanceOf(user3.address);
    const amount = await convertToCurrencyDecimals(dai.address, "100");
    // await supplyAndValidate(dai, "1000", user3, true);
    await dai.connect(user3.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(user3.signer)
      .borrow(dai.address, amount, "0", user3.address, {
        gasLimit: 5000000,
      });
    await pool.connect(user3.signer).repay(dai.address, amount, user3.address);

    const daiBalanceAfter = await dai.balanceOf(user3.address);
    expect(daiBalanceAfter).to.be.equal(daiBalance);
  });

  it("TC-erc20-repay-13 User 1 No loan but to  repay token(should fail)", async () => {
    const {
      users: [user1],
      dai,
    } = testEnv;

    await expect(repayAndValidate(dai, "1000", user1)).to.be.revertedWith(
      ProtocolErrors.NO_DEBT_OF_SELECTED_TYPE
    );
  });
});
