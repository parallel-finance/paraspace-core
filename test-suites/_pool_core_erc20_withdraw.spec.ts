import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {parseEther, formatEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT, ONE_YEAR} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {advanceTimeAndBlock} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  borrowAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
  withdrawAndValidate,
} from "./helpers/validated-steps";
describe("pToken/debtToken Mint and Burn Event Accounting", () => {
  const firstDaiDeposit = "10000";
  const secondDaiDeposit = "20000";
  let testEnv: TestEnv;

  before("Initialize Depositors", async () => {
    testEnv = await loadFixture(testEnvFixture);
  });

  it("TC-erc20- withdraw-01 User 2 deposits 10k DAI", async () => {
    const {
      dai,
      users: [, user2],
    } = testEnv;

    // User 2 - Deposit dai
    await supplyAndValidate(dai, firstDaiDeposit, user2, true);
  });

  it("TC-erc20- withdraw-02 User 1 deposits 20k DAI and borrows 8K DAI", async () => {
    const {
      dai,
      users: [user1],
    } = testEnv;

    // User 1 - Deposit dai
    await supplyAndValidate(dai, secondDaiDeposit, user1, true);

    // User 1 - Borrow dai
    await borrowAndValidate(dai, "8000", user1);
  });

  it("TC-erc20- withdraw-03 User 1 tries to withdraw from the deposited DAI without paying the accrued interest (should fail)", async () => {
    const {
      dai,
      users: [user1],
      pool,
    } = testEnv;

    await expect(
      pool
        .connect(user1.signer)
        .withdraw(
          dai.address,
          await convertToCurrencyDecimals(dai.address, secondDaiDeposit),
          user1.address
        )
    ).to.be.revertedWith(
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    );
  });

  it("TC-erc20- withdraw-04 User 2 Redeem non loan token (should fail)", async () => {
    const {
      wBTC,
      pool,
      users: [, user2],
    } = testEnv;
    const wBTCBalance = await wBTC.balanceOf(user2.address);
    await wBTC.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT);

    await expect(
      pool
        .connect(user2.signer)
        .withdraw(
          wBTC.address,
          await convertToCurrencyDecimals(wBTC.address, "100"),
          user2.address
        )
    ).to.be.revertedWith(ProtocolErrors.NOT_ENOUGH_AVAILABLE_USER_BALANCE);

    // User 2 - dAI balance should not be change
    const daiBalanceAfter = await wBTC.balanceOf(user2.address);
    expect(daiBalanceAfter).to.equal(wBTCBalance);
  });

  it("TC-erc20- withdraw-05 User 2 Redeem 20k exceeds the amount of its own supply 10K (No borrow) (should fail)", async () => {
    const {
      dai,
      pool,
      users: [, user2],
    } = testEnv;
    const daiBalance = await dai.balanceOf(user2.address);
    await dai.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT);

    await expect(
      pool
        .connect(user2.signer)
        .withdraw(
          dai.address,
          await convertToCurrencyDecimals(dai.address, secondDaiDeposit),
          user2.address
        )
    ).to.be.revertedWith(ProtocolErrors.NOT_ENOUGH_AVAILABLE_USER_BALANCE);

    // User 2 - dAI balance should not be change
    const daiBalanceAfter = await dai.balanceOf(user2.address);
    expect(daiBalanceAfter).to.equal(daiBalance);
  });

  it("TC-erc20- withdraw-06 User 1 can withdraw the deposited DAI up to debt value", async () => {
    const {
      variableDebtDai,
      dai,
      users: [user1],
    } = testEnv;

    const debtBalanceBeforeWithdraw = await variableDebtDai.balanceOf(
      user1.address
    );

    // withdraw DAI
    await withdrawAndValidate(
      dai,
      formatEther(debtBalanceBeforeWithdraw.toString()),
      user1
    );
  });

  it("TC-erc20- withdraw-07 User 2 withdraw reaches Health Factor 1~1.1", async () => {
    const {
      dai,
      pool,
      users: [, user2],
    } = testEnv;
    await borrowAndValidate(dai, "5000", user2);
    await pool
      .connect(user2.signer)
      .withdraw(
        dai.address,
        await convertToCurrencyDecimals(dai.address, "3500"),
        user2.address
      );

    // user2 - healthFactor value is between 1.1 - 1.0
    const healthFactor = (await pool.getUserAccountData(user2.address))
      .healthFactor;
    expect(healthFactor)
      .to.be.most(parseEther("1.1"))
      .to.be.least(parseEther("1.0"));
  });

  it("TC-erc20- withdraw-08 User 2 fully repays the loan plus any accrued interest", async () => {
    const {
      dai,
      variableDebtDai,
      users: [, user2],
      pool,
    } = testEnv;

    const availableToBorrowBeforeRepay = (
      await pool.getUserAccountData(user2.address)
    ).availableBorrowsBase;
    const daiBalanceBeforeRepay = await dai.balanceOf(user2.address);
    const debtBalanceBeforeRepay = await variableDebtDai.balanceOf(
      user2.address
    );

    // repay dai loan
    const repayTx = await pool
      .connect(user2.signer)
      .repay(dai.address, MAX_UINT_AMOUNT, user2.address);
    await repayTx.wait();

    // User 1 - Available to borrow should have increased
    const availableToBorrowAfterRepay = (
      await pool.getUserAccountData(user2.address)
    ).availableBorrowsBase;
    expect(availableToBorrowAfterRepay).to.be.gt(availableToBorrowBeforeRepay);

    // User 1 - Debt token balance should be 0
    const debtBalanceAfterRepay = await variableDebtDai.balanceOf(
      user2.address
    );
    expect(debtBalanceAfterRepay).to.be.equal(0);

    // User 1 - DAI balance should have decreased at least in the debtBalanceBeforeRepay amount
    const daiBalanceAfterRepay = await dai.balanceOf(user2.address);
    expect(daiBalanceAfterRepay).to.be.lte(
      daiBalanceBeforeRepay.sub(debtBalanceBeforeRepay)
    );
  });

  it("TC-erc20- withdraw-09 User 1 fully repays the loan plus any accrued interest", async () => {
    const {
      dai,
      variableDebtDai,
      users: [user1],
      pool,
    } = testEnv;

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
  });

  it("TC-erc20- withdraw-10 User 1 no longer acquires share of borrower interest", async () => {
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

  it("TC-erc20- withdraw-11 User 1 removes the deposited DAI from collateral", async () => {
    const {
      users: [user1],
      dai,
    } = testEnv;

    await switchCollateralAndValidate(user1, dai, false);
  });

  it("TC-erc20- withdraw-12 User 1 fully withdraws the deposited DAI", async () => {
    const {
      dai,
      pDai,
      users: [user1],
      pool,
    } = testEnv;

    const daiBalanceBeforeWithdraw = await dai.balanceOf(user1.address);
    const pDaiBalanceBeforeWithdraw = await pDai.balanceOf(user1.address);

    // withdraw DAI
    const withdrawAmount = pDaiBalanceBeforeWithdraw;
    const withdrawDAITx = await pool
      .connect(user1.signer)
      .withdraw(dai.address, withdrawAmount, user1.address);
    await withdrawDAITx.wait();

    // User 1 - Available to borrow should be 0
    const availableToBorrowAfterWithdraw = (
      await pool.getUserAccountData(user1.address)
    ).availableBorrowsBase;
    expect(availableToBorrowAfterWithdraw).to.be.equal(0);

    // User 1 - pToken balance should have decreased in withdrawn amount
    const pDaiBalanceAfterWithdraw = await pDai.balanceOf(user1.address);

    expect(pDaiBalanceAfterWithdraw).to.eq(
      pDaiBalanceBeforeWithdraw.sub(withdrawAmount)
    );

    // User 1 - DAI balance should have increased in withdrawn amount
    const daiBalanceAfterWithdraw = await dai.balanceOf(user1.address);
    expect(daiBalanceAfterWithdraw).to.equal(
      daiBalanceBeforeWithdraw.add(withdrawAmount)
    );
  });
});
