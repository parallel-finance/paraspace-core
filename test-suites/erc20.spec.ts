import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {parseEther, formatEther} from "ethers/lib/utils";
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
  withdrawAndValidate,
} from "./helpers/validated-steps";

describe("pToken/debtToken Mint and Burn Event Accounting", () => {
  let firstDaiDeposit;
  let secondDaiDeposit;
  let accruedInterest = BigNumber.from(0);
  let testEnv: TestEnv;

  before("Initialize Depositors", async () => {
    testEnv = await loadFixture(testEnvFixture);
    firstDaiDeposit = "10000";
    secondDaiDeposit = "20000";
  });

  it("User 2 deposits 10k DAI", async () => {
    const {
      dai,
      users: [, user2],
    } = testEnv;

    // User 2 - Deposit dai
    await supplyAndValidate(dai, firstDaiDeposit, user2, true);
  });

  it("User 1 deposits 20k DAI and borrows 8K DAI", async () => {
    const {
      dai,
      users: [user1],
    } = testEnv;

    // User 1 - Deposit dai
    await supplyAndValidate(dai, secondDaiDeposit, user1, true);

    // User 1 - Borrow dai
    await borrowAndValidate(dai, "8000", user1);
  });

  it("User 2 acquires share of borrower interest", async () => {
    const {
      pDai,
      users: [, user2],
    } = testEnv;
    const pDaiBalanceBefore = await pDai.balanceOf(user2.address);

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    const pDaiBalanceAfter = await pDai.balanceOf(user2.address);
    expect(pDaiBalanceAfter).to.be.gt(pDaiBalanceBefore);

    accruedInterest = pDaiBalanceAfter.sub(pDaiBalanceBefore);
  });

  it("User 1 tries to send the pToken to User 2 (should fail)", async () => {
    const {
      pDai,
      users: [user1, user2],
    } = testEnv;

    await expect(
      pDai.connect(user1.signer).transferFrom(user1.address, user2.address, 1)
    ).to.be.reverted;
  });

  it("User 1 tries to remove the deposited DAI from collateral without paying the accrued interest (should fail)", async () => {
    const {
      dai,
      users: [user1],
      pool,
    } = testEnv;

    await expect(
      pool.connect(user1.signer).setUserUseERC20AsCollateral(dai.address, false)
    ).to.be.revertedWith(
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    );
  });

  it("User 1 tries to withdraw from the deposited DAI without paying the accrued interest (should fail)", async () => {
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

  it("User 1 partially repays the accrued interest on borrowed DAI", async () => {
    const {
      users: [user1],
      dai,
    } = testEnv;

    await mintAndValidate(dai, firstDaiDeposit, user1);
    await repayAndValidate(dai, "1000", user1);
  });

  it("User 2 still acquires share of borrower interest, but now less", async () => {
    const {
      pDai,
      users: [, user2],
    } = testEnv;
    const pDaiBalance = await pDai.balanceOf(user2.address);

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    const pDaiBalanceAfter = await pDai.balanceOf(user2.address);
    expect(pDaiBalanceAfter).to.be.gt(pDaiBalance);

    expect(pDaiBalanceAfter.sub(pDaiBalance)).to.be.lt(accruedInterest);
  });

  it("User 1 can withdraw the deposited DAI up to debt value", async () => {
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

  it("User 1 fully repays the loan plus any accrued interest", async () => {
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

  it("User 2 no longer acquires share of borrower interest", async () => {
    const {
      pDai,
      users: [, user2],
    } = testEnv;
    const pDaiBalance = await pDai.balanceOf(user2.address);

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    const pDaiBalanceAfter = await pDai.balanceOf(user2.address);
    expect(pDaiBalanceAfter).to.be.equal(pDaiBalance);
  });

  it("User 1 removes the deposited DAI from collateral", async () => {
    const {
      users: [user1],
      dai,
    } = testEnv;

    await switchCollateralAndValidate(user1, dai, false);
  });

  it("User 1 fully withdraws the deposited DAI", async () => {
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
  it("user 3 not Obtain approve to Operate supplying  10K (should fail)", async () => {
    const {
      dai,
      pDai,
      pool,
      users: [, , user3],
    } = testEnv;
    const pDaiBalance = await pDai.balanceOf(user3.address);
    await mintAndValidate(dai, firstDaiDeposit, user3);
    const balance = await dai.balanceOf(user3.address);

    await expect(
      pool
        .connect(user3.signer)
        .supply(dai.address, firstDaiDeposit, user3.address, "0")
    ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

    // User 3 - DAI balance should remain unchanged
    const balanceAfter = await dai.balanceOf(user3.address);
    expect(balanceAfter).to.equal(balance);

    // User 3 - pDAI balance should not be increased
    const pDaiBalanceAfter = await pDai.balanceOf(user3.address);
    expect(pDaiBalanceAfter).to.equal(pDaiBalance);
  });

  it("user 3 supply 10k greater than approve 5k (should fail)", async () => {
    const {
      dai,
      pDai,
      pool,
      users: [, , user3],
    } = testEnv;
    const pDaiBalance = await pDai.balanceOf(user3.address);
    const balance = await dai.balanceOf(user3.address);
    const amount = await convertToCurrencyDecimals(
      dai.address,
      firstDaiDeposit
    );
    await dai.connect(user3.signer).approve(pool.address, parseEther("5000"));
    await expect(
      pool.connect(user3.signer).supply(dai.address, amount, user3.address, "0")
    ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");

    // User 3 - DAI balance should remain unchanged
    const balanceAfter = await dai.balanceOf(user3.address);
    expect(balanceAfter).to.equal(balance);

    // User 3 - pDAI balance should not be increased
    const pDaiBalanceAfter = await pDai.balanceOf(user3.address);
    expect(pDaiBalanceAfter).to.equal(pDaiBalance);
  });

  it("user 3 supply 20K greater than user balance  10K  (should fail) ", async () => {
    const {
      dai,
      pDai,
      pool,
      users: [, , user3],
    } = testEnv;
    const pDaiBalance = await pDai.balanceOf(user3.address);
    const balance = await dai.balanceOf(user3.address);
    const amount = await convertToCurrencyDecimals(dai.address, "200000");
    await dai.connect(user3.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await expect(
      pool.connect(user3.signer).supply(dai.address, amount, user3.address, "0")
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

    // User 3 - DAI balance should remain unchanged
    const balanceAfter = await dai.balanceOf(user3.address);
    expect(balanceAfter).to.equal(balance);

    // User 3 - pDAI balance should not be increased
    const pDaiBalanceAfter = await pDai.balanceOf(user3.address);
    expect(pDaiBalanceAfter).to.equal(pDaiBalance);
  });

  it("user 3 Users do not supply loans to borrow (should fail) ", async () => {
    const {
      dai,
      pool,
      users: [, , user3],
      variableDebtDai,
    } = testEnv;
    const debtBalanceBeforeWithdraw = await variableDebtDai.balanceOf(
      user3.address
    );

    const balance = await dai.balanceOf(user3.address);
    await dai.connect(user3.signer).approve(pool.address, MAX_UINT_AMOUNT);
    const amount = await convertToCurrencyDecimals(
      dai.address,
      firstDaiDeposit
    );
    await expect(
      pool
        .connect(user3.signer)
        .borrow(dai.address, amount, "0", user3.address, {
          gasLimit: 5000000,
        })
    ).to.be.revertedWith(ProtocolErrors.COLLATERAL_BALANCE_IS_ZERO);

    // User 3 - DAI balance should remain unchanged
    const balanceAfter = await dai.balanceOf(user3.address);
    expect(balanceAfter).to.equal(balance);

    // User 3 - debtBalance should not change
    const debtBalanceAfterWithdraw = await variableDebtDai.balanceOf(
      user3.address
    );
    expect(debtBalanceBeforeWithdraw).to.equal(debtBalanceAfterWithdraw);
  });

  it("user 3 Redeem 20k exceeds the amount of its own supply 10k (no borrow) (should fail)", async () => {
    const {
      dai,
      pool,
      users: [, , user3],
    } = testEnv;
    const daiBalance = await dai.balanceOf(user3.address);
    await dai.connect(user3.signer).approve(pool.address, MAX_UINT_AMOUNT);

    await supplyAndValidate(dai, firstDaiDeposit, user3, true);

    await expect(
      pool
        .connect(user3.signer)
        .withdraw(
          dai.address,
          await convertToCurrencyDecimals(dai.address, secondDaiDeposit),
          user3.address
        )
    ).to.be.revertedWith(ProtocolErrors.NOT_ENOUGH_AVAILABLE_USER_BALANCE);

    // User 3 - dAI balance should not be change
    const daiBalanceAfter = await dai.balanceOf(user3.address);
    expect(daiBalanceAfter).to.equal(daiBalance);
  });

  it("user 3 Borrow is greater than collateral borrow limit (should fail)", async () => {
    const {
      dai,
      pool,
      users: [, , user3],
    } = testEnv;
    const daiBalance = await dai.balanceOf(user3.address);
    const amount = await convertToCurrencyDecimals(
      dai.address,
      firstDaiDeposit
    );
    await dai.connect(user3.signer).approve(pool.address, MAX_UINT_AMOUNT);

    await expect(
      pool
        .connect(user3.signer)
        .borrow(dai.address, amount, "0", user3.address, {
          gasLimit: 5000000,
        })
    ).to.be.revertedWith(ProtocolErrors.COLLATERAL_CANNOT_COVER_NEW_BORROW);

    // User 3 - dAI balance should not be change
    const daiBalanceAfter = await dai.balanceOf(user3.address);
    expect(daiBalanceAfter).to.equal(daiBalance);
  });

  it("user 3 Repay 7k exceeds borrowed 5K", async () => {
    const {
      dai,
      pool,
      variableDebtDai,
      users: [, , user3],
    } = testEnv;
    const daiBalanceBeforeRepay = await dai.balanceOf(user3.address);
    const debtBalanceBeforeRepay = await variableDebtDai.balanceOf(
      user3.address
    );

    // borrow dai
    await borrowAndValidate(dai, "5000", user3);
    const amount = convertToCurrencyDecimals(dai.address, "7000");

    const availableToBorrowBeforeRepay = (
      await pool.getUserAccountData(user3.address)
    ).availableBorrowsBase;

    // repay dai loan
    const repayTx = await pool
      .connect(user3.signer)
      .repay(dai.address, amount, user3.address);
    await repayTx.wait();

    // User 3 - Available to borrow should have increased
    const availableToBorrowAfterRepay = (
      await pool.getUserAccountData(user3.address)
    ).availableBorrowsBase;
    expect(availableToBorrowAfterRepay).to.be.gt(availableToBorrowBeforeRepay);

    // User 3 - Debt token balance should be 0
    const debtBalanceAfterRepay = await variableDebtDai.balanceOf(
      user3.address
    );
    expect(debtBalanceAfterRepay).to.be.equal(0);

    // User 3 - DAI balance should have decreased at least in the debtBalanceBeforeRepay amount
    const daiBalanceAfterRepay = await dai.balanceOf(user3.address);
    expect(daiBalanceAfterRepay).to.be.lte(
      daiBalanceBeforeRepay.sub(debtBalanceBeforeRepay)
    );
  });

  it("user 3 Borrow 21K is greater than the max liquidity 20K amount  (should fail)", async () => {
    const {
      dai,
      usdc,
      pDai,
      pool,
      variableDebtDai,
      users: [, , user3],
    } = testEnv;
    const pDaiBalance = await pDai.balanceOf(user3.address);
    const daiBalance = await dai.balanceOf(user3.address);
    const debtBalance = await variableDebtDai.balanceOf(user3.address);

    await supplyAndValidate(usdc, "30000", user3, true);

    const amount = await convertToCurrencyDecimals(dai.address, "21000");
    await expect(
      pool
        .connect(user3.signer)
        .borrow(dai.address, amount, "0", user3.address, {
          gasLimit: 5000000,
        })
    ).to.be.reverted;

    // // User 3 - dAI balance should not be increased
    const daiBalanceAfter = await dai.balanceOf(user3.address);
    expect(daiBalanceAfter).to.equal(daiBalance);

    // User 3 - pDAI balance should not be increased
    const pDaiBalanceAfter = await pDai.balanceOf(user3.address);
    expect(pDaiBalanceAfter).to.equal(pDaiBalance);

    // User 3 -  debt balance should not be increased
    const debtBalanceAfter = await variableDebtDai.balanceOf(user3.address);
    expect(debtBalanceAfter).to.be.equal(debtBalance);
  });

  it("user 3 withdraw reaches Health Factor 1~1.1", async () => {
    const {
      dai,
      usdc,
      pool,
      users: [, , user3],
    } = testEnv;
    await borrowAndValidate(dai, "10000", user3);
    await borrowAndValidate(usdc, "15000", user3);
    await pool
      .connect(user3.signer)
      .withdraw(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, "8000"),
        user3.address
      );

    // user3 - healthFactor value is between 1.1 - 1.0
    const healthFactor = (await pool.getUserAccountData(user3.address))
      .healthFactor;
    expect(healthFactor)
      .to.be.most(parseEther("1.1"))
      .to.be.least(parseEther("1.0"));
  });

  it("user 3 Reaching the liquidation threshold, repay to make it recover health", async () => {
    const {
      usdc,
      pool,
      users: [, , user3],
    } = testEnv;

    const healthFactor = (await pool.getUserAccountData(user3.address))
      .healthFactor;
    await repayAndValidate(usdc, "10000", user3);

    //user3 -  health factor should have improved
    const healthFactorAfter = (await pool.getUserAccountData(user3.address))
      .healthFactor;
    expect(healthFactorAfter).to.be.least(healthFactor);
  });

  it("user 3 If the debt is not exceeded, Ptoken can transfer", async () => {
    const {
      dai,
      pDai,
      users: [, , user3, user4],
    } = testEnv;
    const amount = await convertToCurrencyDecimals(dai.address, "1000");

    const pDaiBalance = await pDai.balanceOf(user4.address);
    await pDai.connect(user3.signer).transfer(user4.address, amount);

    const pDaiBalanceAfter = await pDai.balanceOf(user4.address);

    //  User 4 - pDAI balance should be increased
    expect(pDaiBalanceAfter).to.be.equal(pDaiBalance.add(amount));
  });

  it("demo QA case", async () => {
    const {
      dai,
      pool,
      users: [user1],
    } = testEnv;
    const amount = await convertToCurrencyDecimals(dai.address, "10000");

    // mint token
    const initialBalance = await dai.balanceOf(user1.address);
    await dai.connect(user1.signer)["mint(uint256)"](amount);
    const balance = await dai.balanceOf(user1.address);
    expect(balance).to.be.equal(initialBalance.add(amount));
    // supply token
    await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(user1.signer)
      .supply(dai.address, amount, user1.address, "0");
    const tokenBalance = await dai.balanceOf(user1.address);
    expect(tokenBalance).to.be.equal(balance.sub(amount));
  });
});
