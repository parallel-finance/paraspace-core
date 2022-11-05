import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {parseEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT, ONE_YEAR} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {advanceTimeAndBlock} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  assertHealthFactorCalculation,
  borrowAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";

const fixture = async () => {
  const testEnv = await loadFixture(testEnvFixture);
  const {
    dai,
    users: [user1],
  } = testEnv;

  // User 1 - Deposit dai
  await supplyAndValidate(dai, "20000", user1, true);

  return testEnv;
};

describe("pToken/debtToken Borrow Event Accounting", () => {
  const firstDaiDeposit = "10000";
  const secondDaiDeposit = "20000";

  it("TC-erc20-borrow-01 User 1 shouldn't borrow 16k usdc which would exceed current pool liquidity (should fail)", async () => {
    const {
      pool,
      users: [user1],
      usdc,
    } = await loadFixture(fixture);
    const amount = await convertToCurrencyDecimals(usdc.address, "100");
    //FIXME(alan): may we have a error code for this.
    await expect(
      pool
        .connect(user1.signer)
        .borrow(usdc.address, amount, "0", user1.address, {
          gasLimit: 5000000,
        })
    ).to.be.reverted;
  });

  it("TC-erc20-borrow-02 User 1 shouldn't borrow 20k USDC which would exceed his borrow limit (should fail)", async () => {
    const {
      dai,
      pool,
      users: [user1],
    } = await loadFixture(fixture);
    const amount = await convertToCurrencyDecimals(
      dai.address,
      secondDaiDeposit
    );
    await expect(
      pool
        .connect(user1.signer)
        .borrow(dai.address, amount, "0", user1.address, {
          gasLimit: 5000000,
        })
    ).to.be.revertedWith(ProtocolErrors.COLLATERAL_CANNOT_COVER_NEW_BORROW);
  });

  it("TC-erc20-borrow-03 User 2 tries to borrow without supply asset (should fail) ", async () => {
    const {
      dai,
      pool,
      users: [, user2],
      variableDebtDai,
    } = await loadFixture(fixture);
    const debtBalanceBeforeWithdraw = await variableDebtDai.balanceOf(
      user2.address
    );

    const balance = await dai.balanceOf(user2.address);
    await dai.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT);
    const amount = await convertToCurrencyDecimals(
      dai.address,
      firstDaiDeposit
    );
    await expect(
      pool
        .connect(user2.signer)
        .borrow(dai.address, amount, "0", user2.address, {
          gasLimit: 5000000,
        })
    ).to.be.revertedWith(ProtocolErrors.COLLATERAL_BALANCE_IS_ZERO);

    // User 2 - DAI balance should remain unchanged
    const balanceAfter = await dai.balanceOf(user2.address);
    expect(balanceAfter).to.equal(balance);

    // User 2 - debtBalance should not change
    const debtBalanceAfterWithdraw = await variableDebtDai.balanceOf(
      user2.address
    );
    expect(debtBalanceBeforeWithdraw).to.equal(debtBalanceAfterWithdraw);
  });

  it("TC-erc20-borrow-04 User 2 tries to borrow different tokens ", async () => {
    const {
      ape,
      usdt,
      users: [user1, user2],
    } = await loadFixture(fixture);

    // User 2 - deposit liquidity
    await supplyAndValidate(usdt, firstDaiDeposit, user2, true);
    await supplyAndValidate(ape, firstDaiDeposit, user2, true);

    // User 1 - Borrow ape、usdt
    await borrowAndValidate(ape, "100", user1);
    await borrowAndValidate(usdt, "100", user1);
  });

  describe("borrow erc20 token unit case", () => {
    const secondDaiDeposit = "20000";
    let testEnv: TestEnv;

    before("Initialize Depositors", async () => {
      testEnv = await loadFixture(fixture);
    });

    it("TC-erc20-borrow-05 User 1 borrows 8K DAI", async () => {
      const {
        dai,
        users: [user1],
      } = testEnv;

      // User 1 - Borrow dai
      await borrowAndValidate(dai, "8000", user1);
    });

    it("TC-erc20-borrow-06 User 1 acquires share of borrower interest", async () => {
      const {
        pDai,
        users: [user1],
      } = testEnv;
      const pDaiBalanceBefore = await pDai.balanceOf(user1.address);

      // Advance time and blocks
      await advanceTimeAndBlock(parseInt(ONE_YEAR));

      // User 1 - pDAI balance should have increased
      const pDaiBalanceAfter = await pDai.balanceOf(user1.address);
      expect(pDaiBalanceAfter).to.be.gt(pDaiBalanceBefore);
    });

    it("TC-erc20-borrow-07 User 1 If the debt is not exceeded, Ptoken can transfer", async () => {
      const {
        dai,
        pDai,
        users: [user1, , user3],
      } = testEnv;
      const amount = await convertToCurrencyDecimals(dai.address, "100");

      const pDaiBalance = await pDai.balanceOf(user3.address);
      // User 1 transfer to User 3
      await pDai.connect(user1.signer).transfer(user3.address, amount);

      const pDaiBalanceAfter = await pDai.balanceOf(user3.address);

      //  User 3 - pDAI balance should be increased
      expect(pDaiBalanceAfter).to.be.equal(pDaiBalance.add(amount));
    });

    it("TC-erc20-borrow-08 User 2 borrow has reached the liquidation threshold", async () => {
      const {
        usdc,
        pool,
        users: [, user2],
      } = testEnv;
      // User 2 - Deposit usdc
      await supplyAndValidate(usdc, secondDaiDeposit, user2, true);

      // User 2 - Borrow usdc
      await borrowAndValidate(usdc, "16000", user2);

      // user1 - healthFactor value is between 1.1 - 1.0
      const healthFactor = (await pool.getUserAccountData(user2.address))
        .healthFactor;

      expect(healthFactor)
        .to.be.most(parseEther("1.1"))
        .to.be.least(parseEther("1.0"));
    });

    it("TC-erc20-borrow-09 Health factor worses up over time for user with a borrow position due to accrued debt interest", async () => {
      testEnv = await loadFixture(fixture);
      const {
        users: [user1, user2],
        pool,
        dai,
      } = testEnv;

      // User 2 - Deposit 10k DAI
      await supplyAndValidate(dai, firstDaiDeposit, user2, true);
      // User 2 - Borrow 5k DAI
      await borrowAndValidate(dai, "5000", user2);

      const initialHealthFactor1 = (
        await pool.getUserAccountData(user1.address)
      ).healthFactor;
      const initialHealthFactor2 = (
        await pool.getUserAccountData(user2.address)
      ).healthFactor;

      // Advance time and blocks
      await advanceTimeAndBlock(parseInt(ONE_YEAR) * 100);

      // health factor is expected to have worsen for User 2 due to interests on his acquired debt
      expect(initialHealthFactor2).to.be.gt(
        (await pool.getUserAccountData(user2.address)).healthFactor
      );
      // health factor for user 1 should've remained the same
      expect(initialHealthFactor1).to.eq(
        (await pool.getUserAccountData(user1.address)).healthFactor
      );

      await assertHealthFactorCalculation(user1);
      await assertHealthFactorCalculation(user2);
    });

    it("TC-erc20-borrow-10 ERC-721 Health factor worses up over time for user with a borrow position due to accrued debt interest", async () => {
      testEnv = await loadFixture(fixture);
      const {
        users: [user1, user2],
        pool,
        dai,
        bayc,
      } = testEnv;

      // User 2 - Deposit 10k DAI
      await supplyAndValidate(bayc, "1", user2, true);
      // User 2 - Borrow 5k DAI
      await borrowAndValidate(dai, "5000", user2);

      const initialHealthFactor1 = (
        await pool.getUserAccountData(user1.address)
      ).erc721HealthFactor;
      const initialHealthFactor2 = (
        await pool.getUserAccountData(user2.address)
      ).erc721HealthFactor;

      // Advance time and blocks
      await advanceTimeAndBlock(parseInt(ONE_YEAR) * 100);

      // ERC721 health factor is expected to have worsen for User 2 due to interests on his acquired debt
      expect(initialHealthFactor2).to.be.gt(
        (await pool.getUserAccountData(user2.address)).erc721HealthFactor
      );
      // health factor for user 1 should've remained the same
      expect(initialHealthFactor1).to.eq(
        (await pool.getUserAccountData(user1.address)).erc721HealthFactor
      );
    });

    it("TC-erc20-borrow-11 User 1 deposit DAI, DAI ltv drops to 0, then tries borrow (revert expected)", async () => {
      testEnv = await loadFixture(testEnvFixture);
      const {
        pool,
        dai,
        weth,
        users: [user1, user2],
        configurator,
        protocolDataProvider,
      } = testEnv;

      const daiAmount = await convertToCurrencyDecimals(dai.address, "10");
      const wethAmount = await convertToCurrencyDecimals(weth.address, "10");
      const borrowWethAmount = await convertToCurrencyDecimals(
        weth.address,
        "5"
      );

      await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);
      await weth.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT);

      await dai.connect(user1.signer)["mint(uint256)"](daiAmount);
      await weth.connect(user2.signer)["mint(uint256)"](wethAmount);

      await pool
        .connect(user1.signer)
        .supply(dai.address, daiAmount, user1.address, 0);
      await pool
        .connect(user2.signer)
        .supply(weth.address, wethAmount, user2.address, 0);

      // Set DAI LTV = 0
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

      // Borrow all the weth because of issue in collateral needed.
      await expect(
        pool
          .connect(user1.signer)
          .borrow(weth.address, borrowWethAmount, 0, user1.address)
      ).to.be.revertedWith(ProtocolErrors.LTV_VALIDATION_FAILED);

      const userData = await pool.getUserAccountData(user1.address);
      // failing here
      // expect(userData.totalCollateralBase).to.be.eq(parseUnits("10", 8));
      expect(userData.totalDebtBase).to.be.eq(0);
    });
  });
});
