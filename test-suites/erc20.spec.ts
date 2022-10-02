import {expect} from "chai";
import {BigNumber} from "ethers";
import {MAX_UINT_AMOUNT, ONE_YEAR} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {advanceTimeAndBlock, waitForTx} from "../deploy/helpers/misc-utils";
import {RateMode} from "../deploy/helpers/types";
import {MOCK_CHAINLINK_AGGREGATORS_PRICES} from "../deploy/market-config";
import {makeSuite} from "./helpers/make-suite";

makeSuite("pToken/debtToken Mint and Burn Event Accounting", (testEnv) => {
  let firstDaiDeposit;
  let secondDaiDeposit;
  // let thirdDaiDeposit;
  const daiPrice = BigNumber.from(MOCK_CHAINLINK_AGGREGATORS_PRICES.DAI);

  before("Initialize Depositors", async () => {
    const {dai} = testEnv;
    firstDaiDeposit = await convertToCurrencyDecimals(dai.address, "10000");
    secondDaiDeposit = await convertToCurrencyDecimals(dai.address, "20000");
    await convertToCurrencyDecimals(dai.address, "50000");
  });

  it("User 2 deposits 10k DAI", async () => {
    const {
      dai,
      users: [, user2],
      pool,
    } = testEnv;

    await waitForTx(
      await dai
        .connect(user2.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "10000"))
    );

    // approve protocol to access user2 wallet
    await waitForTx(
      await dai.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // User 2 - Deposit dai
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(dai.address, firstDaiDeposit, user2.address, "0")
    );
  });

  it("User 1 deposits 20k DAI and borrows 8K DAI", async () => {
    const {
      dai,
      pDai,
      variableDebtDai,
      users: [user1],
      pool,
    } = testEnv;

    const depositAmount = "20000";
    await waitForTx(
      await dai
        .connect(user1.signer)
        ["mint(uint256)"](
          await convertToCurrencyDecimals(dai.address, depositAmount)
        )
    );

    // User1 has no balance in collateral
    const totalCollateral = (await pool.getUserAccountData(user1.address))
      .totalCollateralBase;
    expect(totalCollateral).to.be.equal(0);

    // approve protocol to access user1 wallet
    await waitForTx(
      await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // User 1 - available to borrow without suppliying should be 0
    const availableToBorrow = (await pool.getUserAccountData(user1.address))
      .availableBorrowsBase;
    expect(availableToBorrow).to.be.equal(0);

    // User 1 - Deposit dai
    await waitForTx(
      await pool
        .connect(user1.signer)
        .supply(dai.address, secondDaiDeposit, user1.address, "0")
    );

    // DAI is as collateral
    const newTotalCollateral = (await pool.getUserAccountData(user1.address))
      .totalCollateralBase;
    const depositedUSD = BigNumber.from(depositAmount).mul(daiPrice);
    expect(newTotalCollateral).to.be.eq(depositedUSD);

    // User 1 - available to borrow should be the supplied amount * dai LTV ratio
    const availableToBorrowAfterSupply = (
      await pool.getUserAccountData(user1.address)
    ).availableBorrowsBase;
    expect(availableToBorrowAfterSupply).to.be.eq(
      depositedUSD.mul(BigNumber.from(75)).div(BigNumber.from(100))
    );

    // check pToken balance is the deposited amount
    const pDaiBalance = await pDai.balanceOf(user1.address);
    expect(pDaiBalance).to.be.equal(secondDaiDeposit);

    // check DAI balance is 0 (has been subtracted the deposited amount)
    const daiBalance = await dai.balanceOf(user1.address);
    expect(daiBalance).to.be.equal(0);

    // User 1 - Borrow dai
    const borrowAmount = "8000";
    const borrowAmountBaseUnits = await convertToCurrencyDecimals(
      dai.address,
      "8000"
    );
    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(
          dai.address,
          borrowAmountBaseUnits,
          RateMode.Variable,
          "0",
          user1.address
        )
    );

    // User 1 - Available to borrow should have decreased in the borrowed amount
    const availableToBorrowAfterBorrow = (
      await pool.getUserAccountData(user1.address)
    ).availableBorrowsBase;
    expect(availableToBorrowAfterBorrow).to.be.eq(
      availableToBorrowAfterSupply.sub(
        BigNumber.from(borrowAmount).mul(daiPrice)
      )
    );

    // User 1 - Debt token balance equals the borrowed amount
    const debtBalanceAfter = await variableDebtDai.balanceOf(user1.address);
    expect(debtBalanceAfter).to.equal(borrowAmountBaseUnits);

    // User 1 - DAI balance should have increased in the borrowed amount
    const daiBalanceAfter = await dai.balanceOf(user1.address);
    expect(daiBalanceAfter).to.equal(daiBalance.add(borrowAmountBaseUnits));
  });

  it("User 2 acquires share of borrower interest", async () => {
    const {
      pDai,
      users: [, user2],
    } = testEnv;
    const pDaiBalance = await pDai.balanceOf(user2.address);

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    const pDaiBalanceAfter = await pDai.balanceOf(user2.address);
    expect(pDaiBalanceAfter).to.be.gt(pDaiBalance);
  });

  it("User 1 tries to send the pToken to User 2 (should fail)", async () => {
    const {
      pDai,
      users: [user1, user2],
    } = testEnv;

    expect(
      pDai.connect(user1.signer).transferFrom(user1.address, user2.address, 1)
    ).to.be.reverted;
  });

  it("User 1 tries to remove the deposited DAI from collateral without paying the accrued interest (should fail)", async () => {
    const {
      dai,
      users: [user1],
      pool,
    } = testEnv;

    expect(
      pool
        .connect(user1.signer)
        .setUserUseReserveAsCollateral(dai.address, false)
    ).to.be.reverted;
  });

  it("User 1 tries to withdraw from the deposited DAI without paying the accrued interest (should fail)", async () => {
    const {
      dai,
      users: [user1],
      pool,
    } = testEnv;

    expect(
      pool
        .connect(user1.signer)
        .withdraw(dai.address, secondDaiDeposit, user1.address)
    ).to.be.reverted;
  });

  it("User 1 partially repays the accrued interest on borrowed DAI", async () => {
    const {
      dai,
      variableDebtDai,
      users: [user1],
      pool,
    } = testEnv;

    await waitForTx(
      await dai
        .connect(user1.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "10000"))
    );

    // approve protocol to access user1 wallet
    await waitForTx(
      await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    const availableToBorrowBeforePartialRepay = (
      await pool.getUserAccountData(user1.address)
    ).availableBorrowsBase;
    const daiBalanceBeforePartialRepay = await dai.balanceOf(user1.address);
    const debtBalanceBeforePartialRepay = await variableDebtDai.balanceOf(
      user1.address
    );

    // partially repay dai loan
    const repayAmount = await convertToCurrencyDecimals(dai.address, "1000");
    const repayTx = await pool
      .connect(user1.signer)
      .repay(dai.address, repayAmount, RateMode.Variable, user1.address, false);
    await repayTx.wait();

    // User 1 - Available to borrow should have increased
    const availableToBorrowAfterPartialRepay = (
      await pool.getUserAccountData(user1.address)
    ).availableBorrowsBase;
    expect(availableToBorrowAfterPartialRepay).to.be.gt(
      availableToBorrowBeforePartialRepay
    );

    // User 1 - Debt token balance should have decreased
    const debtBalanceAfterPartialRepay = await variableDebtDai.balanceOf(
      user1.address
    );
    expect(debtBalanceAfterPartialRepay).to.lt(debtBalanceBeforePartialRepay);

    // User 1 - DAI balance should have increased in the repaid amount
    const daiBalanceAfterPartialRepay = await dai.balanceOf(user1.address);
    expect(daiBalanceAfterPartialRepay).to.equal(
      daiBalanceBeforePartialRepay.sub(repayAmount)
    );
  });

  it("User 2 still acquires share of borrower interest", async () => {
    const {
      pDai,
      users: [, user2],
    } = testEnv;
    const pDaiBalance = await pDai.balanceOf(user2.address);

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    const pDaiBalanceAfter = await pDai.balanceOf(user2.address);
    expect(pDaiBalanceAfter).to.be.gt(pDaiBalance);
  });

  it("User 1 can withdraw the deposited DAI up to debt value", async () => {
    const {
      dai,
      pDai,
      variableDebtDai,
      users: [user1],
      pool,
    } = testEnv;

    const availableToBorrowBeforeWithdraw = (
      await pool.getUserAccountData(user1.address)
    ).availableBorrowsBase;
    const daiBalanceBeforeWithdraw = await dai.balanceOf(user1.address);
    const debtBalanceBeforeWithdraw = await variableDebtDai.balanceOf(
      user1.address
    );
    const pDaiBalanceBeforeWithdraw = await pDai.balanceOf(user1.address);

    // withdraw DAI
    const withdrawAmount = debtBalanceBeforeWithdraw;
    const withdrawDAITx = await pool
      .connect(user1.signer)
      .withdraw(dai.address, withdrawAmount, user1.address);
    await withdrawDAITx.wait();

    // User 1 - Available to borrow should have decreased
    const availableToBorrowAfterWithdraw = (
      await pool.getUserAccountData(user1.address)
    ).availableBorrowsBase;
    expect(availableToBorrowAfterWithdraw).to.be.lt(
      availableToBorrowBeforeWithdraw
    );

    // User 1 - Debt token balance should be the same (or actually have earned some lil-extra debt)
    const debtBalanceAfterWithdraw = await variableDebtDai.balanceOf(
      user1.address
    );
    expect(debtBalanceAfterWithdraw).to.gte(debtBalanceBeforeWithdraw);

    // User 1 - pToken balance should have decreased
    const pDaiBalanceAfterWithdraw = await pDai.balanceOf(user1.address);
    expect(pDaiBalanceAfterWithdraw).to.be.lt(pDaiBalanceBeforeWithdraw);

    // User 1 - DAI balance should have increased in withdrawn amount
    const daiBalanceAfterWithdraw = await dai.balanceOf(user1.address);
    expect(daiBalanceAfterWithdraw).to.equal(
      daiBalanceBeforeWithdraw.add(withdrawAmount)
    );
  });

  it("User 1 fully repays the accrued interest", async () => {
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
      .repay(
        dai.address,
        MAX_UINT_AMOUNT,
        RateMode.Variable,
        user1.address,
        false
      );
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
      dai,
      users: [user1],
      pool,
    } = testEnv;

    await pool
      .connect(user1.signer)
      .setUserUseReserveAsCollateral(dai.address, false);

    // User1 has no balance in collateral
    const totalCollateral = (await pool.getUserAccountData(user1.address))
      .totalCollateralBase;
    expect(totalCollateral).to.be.equal(0);
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
