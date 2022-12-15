import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {MAX_UINT_AMOUNT, ONE_YEAR} from "../helpers/constants";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {
  advanceTimeAndBlock,
  setAutomine,
  setAutomineEvm,
  waitForTx,
} from "../helpers/misc-utils";
import {ProtocolErrors} from "../helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  borrowAndValidate,
  mintAndValidate,
  repayAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {almostEqual} from "./helpers/uniswapv3-helper";
import {utils} from "ethers";
import {getVariableDebtToken} from "../helpers/contracts-getters";

const {RESERVE_INACTIVE, SAME_BLOCK_BORROW_REPAY} = ProtocolErrors;

const fixture = async () => {
  const testEnv = await loadFixture(testEnvFixture);
  const {
    dai,
    usdc,
    users: [user1, user2],
  } = testEnv;

  // User 1 - Deposit dai
  await supplyAndValidate(dai, "10000", user1, true);

  // User 1 - Borrow dai
  await borrowAndValidate(dai, "5000", user1);

  // User 2 - Deposit usdc
  await supplyAndValidate(usdc, "20000", user2, true);

  // User 2 - Borrow usdc reach the clearing threshold
  await borrowAndValidate(usdc, "16000", user2);

  return testEnv;
};

describe("pToken Repay Event Accounting", () => {
  it("TC-erc20-repay-01: User 3 tries to make repayment without loan (should fail)", async () => {
    const {
      users: [, , user3],
      dai,
    } = await loadFixture(fixture);

    await expect(repayAndValidate(dai, "1000", user3)).to.be.revertedWith(
      ProtocolErrors.NO_DEBT_OF_SELECTED_TYPE
    );
  });

  it("TC-erc20-repay-02 User1 tries to repay for other user", async () => {
    const {
      usdc,
      pool,
      oracle,
      users: [user1, user2],
    } = await loadFixture(fixture);
    const totalDebtBeforeRepay = (await pool.getUserAccountData(user2.address))
      .totalDebtBase;

    const repayAmount = "100";
    const amount = await convertToCurrencyDecimals(usdc.address, repayAmount);

    const usdcPrice = await oracle.getAssetPrice(usdc.address);
    const availableValue = usdcPrice.mul(repayAmount);

    await mintAndValidate(usdc, "1000", user1);
    await usdc.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);

    // user 1 repay user 2 loan
    await waitForTx(
      await pool
        .connect(user1.signer)
        .repay(usdc.address, amount, user2.address)
    );

    // User 2 - Available to borrow should have increased
    const totalDebtAfterRepay = (await pool.getUserAccountData(user2.address))
      .totalDebtBase;
    almostEqual(totalDebtAfterRepay, totalDebtBeforeRepay.sub(availableValue));
  });

  it("TC-erc20-repay-03 User 1 fully repays the loan plus any accrued interest", async () => {
    const {
      dai,
      variableDebtDai,
      users: [user1],
      pool,
    } = await loadFixture(fixture);

    // mint dai
    await mintAndValidate(dai, "100", user1);

    const availableToBorrowBeforeRepay = (
      await pool.getUserAccountData(user1.address)
    ).availableBorrowsBase;
    const daiBalanceBeforeRepay = await dai.balanceOf(user1.address);
    const debtBalanceBeforeRepay = await variableDebtDai.balanceOf(
      user1.address
    );
    // repay dai loan
    await waitForTx(
      await pool
        .connect(user1.signer)
        .repay(dai.address, MAX_UINT_AMOUNT, user1.address)
    );

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

  it("TC-erc20-repay-04 User 2 health factor should be increased after repay partial debt", async () => {
    const {
      usdc,
      pool,
      users: [, user2],
    } = await loadFixture(fixture);

    const healthFactor = (await pool.getUserAccountData(user2.address))
      .healthFactor;

    await repayAndValidate(usdc, "1000", user2);

    //user2 -  health factor should have improved
    const healthFactorAfter = (await pool.getUserAccountData(user2.address))
      .healthFactor;

    expect(healthFactorAfter).to.be.least(healthFactor);
  });

  it("TC-erc20-repay-05 User 3 Borrow and repay in same block", async () => {
    const {
      users: [, , user3],
      pool,
      dai,
    } = await loadFixture(fixture);
    const firstDaiDeposit = "10000";
    // User 3 - Deposit dai
    await supplyAndValidate(dai, firstDaiDeposit, user3, true);

    const daiBalance = await dai.balanceOf(user3.address);
    const amount = await convertToCurrencyDecimals(dai.address, "100");

    await dai.connect(user3.signer).approve(pool.address, MAX_UINT_AMOUNT);
    //FIXME(alan): It doesn't guarantee those two transactions in a same block
    await waitForTx(
      await pool
        .connect(user3.signer)
        .borrow(dai.address, amount, "0", user3.address, {
          gasLimit: 5000000,
        })
    );
    await waitForTx(
      await pool.connect(user3.signer).repay(dai.address, amount, user3.address)
    );

    const daiBalanceAfter = await dai.balanceOf(user3.address);
    expect(daiBalanceAfter).to.be.equal(daiBalance);
  });

  describe("Repay interest token uint case", () => {
    let accruedInterest = BigNumber.from(0);
    let testEnv: TestEnv;

    before("Load fixture", async () => {
      testEnv = await loadFixture(fixture);
    });

    it("TC-erc20-repay-06 User 1 acquires share of borrower interest", async () => {
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

      accruedInterest = pDaiBalanceAfter.sub(pDaiBalanceBefore);
    });

    it("TC-erc20-repay-07 User 1 partially repays the accrued interest on borrowed DAI", async () => {
      const {
        users: [user1],
        dai,
      } = testEnv;
      const firstDaiDeposit = "10000";

      await mintAndValidate(dai, firstDaiDeposit, user1);
      // User 1 - repay accrued interest
      await repayAndValidate(dai, "100", user1);
    });

    it("TC-erc20-repay-08 User 1 still acquires share of borrower interest, but now less", async () => {
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
  });

  describe("Repay validations", () => {
    let testEnv: TestEnv;

    beforeEach("Load fixture", async () => {
      testEnv = await loadFixture(testEnvFixture);
    });

    it("TC-erc20-repay-09 validateRepay() when reserve is not active (revert expected)", async () => {
      // Unsure how we can end in this scenario. Would require that it could be deactivated after someone have borrowed
      const {pool, users, dai, protocolDataProvider, configurator, poolAdmin} =
        testEnv;
      const user = users[0];

      const configBefore =
        await protocolDataProvider.getReserveConfigurationData(dai.address);
      expect(configBefore.isActive).to.be.eq(true);
      expect(configBefore.isFrozen).to.be.eq(false);

      await configurator
        .connect(poolAdmin.signer)
        .setReserveActive(dai.address, false);

      const configAfter =
        await protocolDataProvider.getReserveConfigurationData(dai.address);
      expect(configAfter.isActive).to.be.eq(false);
      expect(configAfter.isFrozen).to.be.eq(false);

      await expect(
        pool
          .connect(user.signer)
          .repay(dai.address, utils.parseEther("1"), user.address)
      ).to.be.revertedWith(RESERVE_INACTIVE);
    });

    it("TC-erc20-repay-10 validateRepay() when variable borrowing and repaying in same block (revert expected)", async () => {
      // Same block repay

      const {pool, users, dai, pDai, usdc} = await loadFixture(testEnvFixture);
      const user = users[0];

      // We need some debt.
      await usdc
        .connect(user.signer)
        ["mint(uint256)"](utils.parseEther("2000"));
      await usdc.connect(user.signer).approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(user.signer)
        .supply(usdc.address, utils.parseEther("2000"), user.address, 0);
      await dai.connect(user.signer)["mint(uint256)"](utils.parseEther("2000"));
      await dai
        .connect(user.signer)
        .transfer(pDai.address, utils.parseEther("2000"));

      // Turn off automining - pretty sure that coverage is getting messed up here.
      await setAutomine(false);

      // Borrow 500 dai
      await pool
        .connect(user.signer)
        .borrow(dai.address, utils.parseEther("500"), 0, user.address);

      // Turn on automining, but not mine a new block until next tx
      await setAutomineEvm(true);

      await expect(
        pool
          .connect(user.signer)
          .repay(dai.address, utils.parseEther("500"), user.address)
      ).to.be.revertedWith(SAME_BLOCK_BORROW_REPAY);
    });

    it("TC-erc20-repay-11 validateRepay() when variable borrowing and repaying in same block using credit delegation (revert expected)", async () => {
      const {
        pool,
        dai,
        weth,
        users: [user1, user2, user3],
      } = await loadFixture(testEnvFixture);

      // Add liquidity
      await dai
        .connect(user3.signer)
        ["mint(uint256)"](utils.parseUnits("1000", 18));
      await dai.connect(user3.signer).approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(user3.signer)
        .supply(dai.address, utils.parseUnits("1000", 18), user3.address, 0);

      // User1 supplies 10 WETH
      await dai
        .connect(user1.signer)
        ["mint(uint256)"](utils.parseUnits("100", 18));
      await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);
      await weth
        .connect(user1.signer)
        ["mint(uint256)"](utils.parseUnits("10", 18));
      await weth.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(user1.signer)
        .supply(weth.address, utils.parseUnits("10", 18), user1.address, 0);

      const daiData = await pool.getReserveData(dai.address);
      const variableDebtToken = await getVariableDebtToken(
        daiData.variableDebtTokenAddress
      );

      // User1 approves User2 to borrow 1000 DAI
      expect(
        await variableDebtToken
          .connect(user1.signer)
          .approveDelegation(user2.address, utils.parseUnits("1000", 18))
      );

      // User2 borrows on behalf of User1
      const borrowOnBehalfAmount = utils.parseUnits("100", 18);
      expect(
        await pool
          .connect(user2.signer)
          .borrow(dai.address, borrowOnBehalfAmount, 0, user1.address)
      );

      // Turn off automining to simulate actions in same block
      await setAutomine(false);

      // User2 borrows 2 DAI on behalf of User1
      await pool
        .connect(user2.signer)
        .borrow(dai.address, utils.parseEther("2"), 0, user1.address);

      // Turn on automining, but not mine a new block until next tx
      await setAutomineEvm(true);

      await expect(
        pool
          .connect(user1.signer)
          .repay(dai.address, utils.parseEther("2"), user1.address)
      ).to.be.revertedWith(SAME_BLOCK_BORROW_REPAY);
    });
  });
});
