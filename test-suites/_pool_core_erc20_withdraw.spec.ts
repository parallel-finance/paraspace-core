import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {parseEther, formatEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {ProtocolErrors} from "../deploy/helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  borrowAndValidate,
  supplyAndValidate,
  withdrawAndValidate,
} from "./helpers/validated-steps";

const fixture = async () => {
  const testEnv = await loadFixture(testEnvFixture);
  const {
    dai,
    users: [user1, user2],
  } = testEnv;

  // User 1 - Deposit dai
  await supplyAndValidate(dai, "20000", user1, true);

  // User 1 - Borrow dai
  await borrowAndValidate(dai, "8500", user1);

  // User 2 - Deposit dai
  await supplyAndValidate(dai, "10000", user2, true);

  return testEnv;
};

describe("pToken Withdraw Event Accounting", () => {
  const secondDaiDeposit = "20000";

  it("TC-erc20-withdraw-01 User 1 shouldn't withdraw an asset if he hasn't supplied it (should fail)", async () => {
    const {
      wBTC,
      pool,
      users: [user1],
    } = await loadFixture(fixture);
    await wBTC.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);

    await expect(
      pool
        .connect(user1.signer)
        .withdraw(
          wBTC.address,
          await convertToCurrencyDecimals(wBTC.address, "100"),
          user1.address
        )
    ).to.be.revertedWith(ProtocolErrors.NOT_ENOUGH_AVAILABLE_USER_BALANCE);
  });

  it("TC-erc20-withdraw-02 User 2 shouldn't withdraw asset more than supplied (should fail)", async () => {
    const {
      dai,
      pool,
      users: [, user2],
    } = await loadFixture(fixture);
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
  });

  describe("withdraw erc20 token unit case", () => {
    let testEnv: TestEnv;
    before("Initialize Depositors", async () => {
      testEnv = await loadFixture(fixture);
    });

    it("TC-erc20-withdraw-03 User 1 shouldn't withdraw supplied DAI if he doesn't have enough collateral (should fail)", async () => {
      const {
        dai,
        users: [user1],
        pool,
      } = await loadFixture(fixture);

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

    it("TC-erc20-withdraw-04 User 1 could withdraw collateral until his hf would reaches Health Factor 1~1.1", async () => {
      const {
        dai,
        pool,
        variableDebtDai,
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
      // user1 - healthFactor value is between 1.1 - 1.0
      const healthFactor = (await pool.getUserAccountData(user1.address))
        .healthFactor;
      expect(healthFactor)
        .to.be.most(parseEther("1.1"))
        .to.be.least(parseEther("1.0"));
    });

    it("TC-erc20-withdraw-05 User 1 fully repays the loan", async () => {
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
      expect(availableToBorrowAfterRepay).to.be.gt(
        availableToBorrowBeforeRepay
      );

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

    it("TC-erc20-withdraw-06 User 1 can withdraw all deposited tokens", async () => {
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
});
