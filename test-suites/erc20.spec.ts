import {expect} from "chai";
import {BigNumber} from "ethers";
import {formatEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT, ONE_YEAR} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {advanceTimeAndBlock} from "../deploy/helpers/misc-utils";
import {ProtocolErrors, RateMode} from "../deploy/helpers/types";
import {makeSuite} from "./helpers/make-suite";
import {
  borrowAndValidate,
  mintAndValidate,
  repayAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
  withdrawAndValidate,
} from "./helpers/validated-steps";

makeSuite("pToken/debtToken Mint and Burn Event Accounting", (testEnv) => {
  let firstDaiDeposit;
  let secondDaiDeposit;
  let accruedInterest = BigNumber.from(0);

  before("Initialize Depositors", async () => {
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
      .repay(dai.address, MAX_UINT_AMOUNT, RateMode.Variable, user1.address);
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
});
