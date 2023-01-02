import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {parseEther, formatEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {ProtocolErrors} from "../helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {parseUnits} from "@ethersproject/units";
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

    it("TC-erc20-withdraw-04 User 1 could withdraw collateral until his hf would reaches Health Factor 1.2~1.3", async () => {
      const {
        dai,
        pool,
        variableDebtDai,
        users: [user1],
      } = testEnv;

      // HF = 20000 * 0.000908578801039414 * 0.9 / (8500 * 0.000908578801039414) = 2.1176470588235294118
      const debtBalanceBeforeWithdraw = await variableDebtDai.balanceOf(
        user1.address
      );

      // withdraw DAI
      await withdrawAndValidate(
        dai,
        formatEther(debtBalanceBeforeWithdraw.toString()),
        user1
      );

      // HF = (20000 - 8500) * 0.000908578801039414 * 0.9 / (8500 * 0.000908578801039414) = 1.2176470588235294118
      // user1 - healthFactor value is between 1.2 - 1.3
      const healthFactor = (await pool.getUserAccountData(user1.address))
        .healthFactor;
      expect(healthFactor)
        .to.be.most(parseEther("1.3"))
        .to.be.least(parseEther("1.2"));
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

  context("LTV validation", () => {
    let testEnv: TestEnv;
    const {
      LTV_VALIDATION_FAILED,
      HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD,
    } = ProtocolErrors;

    before(async () => {
      testEnv = await loadFixture(testEnvFixture);
      const {
        pool,
        dai,
        usdc,
        weth,
        users: [user1, user2],
        configurator,
        protocolDataProvider,
      } = testEnv;

      // User 1 deposits 10 Dai, 10 USDC, user 2 deposits 0.071 WETH
      const daiAmount = await convertToCurrencyDecimals(dai.address, "10");
      const usdcAmount = await convertToCurrencyDecimals(usdc.address, "10");
      const wethAmount = await convertToCurrencyDecimals(weth.address, "0.071");

      await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);
      await usdc.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);
      await weth.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT);

      await dai.connect(user1.signer)["mint(uint256)"](daiAmount);
      await usdc.connect(user1.signer)["mint(uint256)"](usdcAmount);
      await weth.connect(user2.signer)["mint(uint256)"](wethAmount);

      await pool
        .connect(user1.signer)
        .supply(dai.address, daiAmount, user1.address, 0);

      await pool
        .connect(user1.signer)
        .supply(usdc.address, usdcAmount, user1.address, 0);

      await pool
        .connect(user2.signer)
        .supply(weth.address, wethAmount, user2.address, 0);

      // Set DAI LTV to 0
      expect(
        await configurator.configureReserveAsCollateral(
          dai.address,
          0,
          8000,
          10500
        )
      )
        .to.emit(configurator, "CollateralConfigurationChanged")
        .withArgs(dai.address, 0, 8000, 10500);

      const ltv = (
        await protocolDataProvider.getReserveConfigurationData(dai.address)
      ).ltv;

      expect(ltv).to.be.equal(0);

      // borrow 0.000414 WETH
      const borrowedAmount = await convertToCurrencyDecimals(
        weth.address,
        "0.000414"
      );

      expect(
        await pool
          .connect(user1.signer)
          .borrow(weth.address, borrowedAmount, 0, user1.address)
      );
    });

    it("TC-erc20-withdraw-07 User cannot withdraw an amount that leaves the borrow position uncovered based on LTV (revert expected)", async () => {
      const {
        pool,
        usdc,
        users: [user1],
      } = testEnv;

      const withdrawnAmount = await convertToCurrencyDecimals(
        usdc.address,
        "1"
      );

      await expect(
        pool
          .connect(user1.signer)
          .withdraw(usdc.address, withdrawnAmount, user1.address)
      ).to.be.revertedWith(LTV_VALIDATION_FAILED);
    });

    it("TC-erc20-withdraw-08 User can withdraw an amount that won't leave the borrow position uncovered based on LTV", async () => {
      const {
        pool,
        dai,
        pDai,
        users: [user1],
      } = testEnv;

      const pDaiBalanceBefore = await pDai.balanceOf(user1.address);

      const withdrawnAmount = await convertToCurrencyDecimals(dai.address, "1");

      expect(
        await pool
          .connect(user1.signer)
          .withdraw(dai.address, withdrawnAmount, user1.address)
      );

      const pDaiBalanceAfter = await pDai.balanceOf(user1.address);

      expect(pDaiBalanceAfter).to.be.eq(pDaiBalanceBefore.sub(withdrawnAmount));
    });

    it("TC-erc20-withdraw-09 validateHFAndLtv() with HF < 1 for 0 LTV asset (revert expected)", async () => {
      testEnv = await loadFixture(testEnvFixture);
      const {
        usdc,
        dai,
        pool,
        poolAdmin,
        configurator,
        protocolDataProvider,
        users: [user, usdcProvider],
      } = testEnv;

      // Supply usdc
      await usdc
        .connect(usdcProvider.signer)
        ["mint(uint256)"](parseUnits("1000", 6));
      await usdc
        .connect(usdcProvider.signer)
        .approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(usdcProvider.signer)
        .supply(usdc.address, parseUnits("1000", 6), usdcProvider.address, 0);

      // Supply dai
      await dai.connect(user.signer)["mint(uint256)"](parseUnits("1000", 18));
      await dai.connect(user.signer).approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(user.signer)
        .supply(dai.address, parseUnits("1000", 18), user.address, 0);

      // Borrow usdc
      await pool
        .connect(user.signer)
        .borrow(usdc.address, parseUnits("500", 6), 0, user.address);

      // Drop LTV
      const daiData = await protocolDataProvider.getReserveConfigurationData(
        dai.address
      );

      await configurator
        .connect(poolAdmin.signer)
        .configureReserveAsCollateral(
          dai.address,
          0,
          daiData.liquidationThreshold,
          daiData.liquidationBonus
        );

      // Withdraw all my dai
      await expect(
        pool
          .connect(user.signer)
          .withdraw(dai.address, parseUnits("500", 18), user.address)
      ).to.be.revertedWith(HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD);
    });
  });
});
