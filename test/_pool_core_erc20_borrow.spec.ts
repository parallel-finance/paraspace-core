import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {parseEther} from "ethers/lib/utils";
import {utils} from "ethers";
import {MAX_UINT_AMOUNT, ONE_YEAR, MAX_BORROW_CAP} from "../helpers/constants";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {ProtocolErrors} from "../helpers/types";
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

      // HF = 20000 * 0.9 / 8000 = 2.25
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
      await borrowAndValidate(usdc, "17000", user2);

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

describe("Borrow validations", () => {
  const {
    RESERVE_FROZEN,
    RESERVE_INACTIVE,
    INVALID_AMOUNT,
    BORROWING_NOT_ENABLED,
    HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD,
  } = ProtocolErrors;
  let testEnv: TestEnv;

  beforeEach("Initialize fixture", async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {addressesProvider, oracle} = testEnv;

    await waitForTx(await addressesProvider.setPriceOracle(oracle.address));
  });

  it("TC-erc20-borrow-12 validateBorrow() when reserve is not active (revert expected)", async () => {
    /**
     * Unclear how we should enter this stage with normal usage.
     * Can be done by sending dai directly to pDai contract after it have been deactivated.
     * If deposited normally it is not possible for us deactivate.
     */

    const {
      pool,
      poolAdmin,
      configurator,
      protocolDataProvider,
      users,
      dai,
      pDai,
      usdc,
    } = testEnv;
    const user = users[0];

    await usdc.connect(user.signer)["mint(uint256)"](utils.parseEther("10000"));
    await usdc
      .connect(user.signer)
      .approve(pool.address, utils.parseEther("10000"));
    await pool
      .connect(user.signer)
      .supply(usdc.address, utils.parseEther("10000"), user.address, 0);

    const configBefore = await protocolDataProvider.getReserveConfigurationData(
      dai.address
    );
    expect(configBefore.isActive).to.be.eq(true);
    expect(configBefore.isFrozen).to.be.eq(false);

    await configurator
      .connect(poolAdmin.signer)
      .setReserveActive(dai.address, false);

    const configAfter = await protocolDataProvider.getReserveConfigurationData(
      dai.address
    );
    expect(configAfter.isActive).to.be.eq(false);
    expect(configAfter.isFrozen).to.be.eq(false);

    // Transferring directly into pDai such that we can borrow
    await dai.connect(user.signer)["mint(uint256)"](utils.parseEther("1000"));
    await dai
      .connect(user.signer)
      .transfer(pDai.address, utils.parseEther("1000"));

    await expect(
      pool
        .connect(user.signer)
        .borrow(dai.address, utils.parseEther("1000"), 0, user.address)
    ).to.be.revertedWith(RESERVE_INACTIVE);
  });

  it("TC-erc20-borrow-13 validateBorrow() when reserve is frozen (revert expected)", async () => {
    const {
      pool,
      poolAdmin,
      configurator,
      protocolDataProvider,
      users,
      dai,
      usdc,
    } = testEnv;
    const user = users[0];

    await dai.connect(user.signer)["mint(uint256)"](utils.parseEther("1000"));
    await dai
      .connect(user.signer)
      .approve(pool.address, utils.parseEther("1000"));
    await pool
      .connect(user.signer)
      .supply(dai.address, utils.parseEther("1000"), user.address, 0);

    await usdc.connect(user.signer)["mint(uint256)"](utils.parseEther("10000"));
    await usdc
      .connect(user.signer)
      .approve(pool.address, utils.parseEther("10000"));
    await pool
      .connect(user.signer)
      .supply(usdc.address, utils.parseEther("10000"), user.address, 0);

    const configBefore = await protocolDataProvider.getReserveConfigurationData(
      dai.address
    );
    expect(configBefore.isActive).to.be.eq(true);
    expect(configBefore.isFrozen).to.be.eq(false);

    await configurator
      .connect(poolAdmin.signer)
      .setReserveFreeze(dai.address, true);

    const configAfter = await protocolDataProvider.getReserveConfigurationData(
      dai.address
    );
    expect(configAfter.isActive).to.be.eq(true);
    expect(configAfter.isFrozen).to.be.eq(true);

    await expect(
      pool
        .connect(user.signer)
        .borrow(dai.address, utils.parseEther("1000"), 0, user.address)
    ).to.be.revertedWith(RESERVE_FROZEN);
  });

  it("TC-erc20-borrow-14 validateBorrow() when amount == 0 (revert expected)", async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {pool, users, dai} = testEnv;
    const user = users[0];

    await expect(
      pool.connect(user.signer).borrow(dai.address, 0, 0, user.address)
    ).to.be.revertedWith(INVALID_AMOUNT);
  });

  it("TC-erc20-borrow-15 validateBorrow() when borrowing is not enabled (revert expected)", async () => {
    const {
      pool,
      poolAdmin,
      configurator,
      protocolDataProvider,
      users,
      dai,
      usdc,
    } = testEnv;
    const user = users[0];

    await dai.connect(user.signer)["mint(uint256)"](utils.parseEther("1000"));
    await dai
      .connect(user.signer)
      .approve(pool.address, utils.parseEther("1000"));
    await pool
      .connect(user.signer)
      .supply(dai.address, utils.parseEther("1000"), user.address, 0);

    await usdc.connect(user.signer)["mint(uint256)"](utils.parseEther("10000"));
    await usdc
      .connect(user.signer)
      .approve(pool.address, utils.parseEther("10000"));
    await pool
      .connect(user.signer)
      .supply(usdc.address, utils.parseEther("10000"), user.address, 0);

    const configBefore = await protocolDataProvider.getReserveConfigurationData(
      dai.address
    );
    expect(configBefore.borrowingEnabled).to.be.eq(true);

    await configurator
      .connect(poolAdmin.signer)
      .setReserveBorrowing(dai.address, false);

    const configAfter = await protocolDataProvider.getReserveConfigurationData(
      dai.address
    );
    expect(configAfter.borrowingEnabled).to.be.eq(false);

    await expect(
      pool
        .connect(user.signer)
        .borrow(dai.address, utils.parseEther("1000"), 0, user.address)
    ).to.be.revertedWith(BORROWING_NOT_ENABLED);
  });

  it("TC-erc20-borrow-16 validateBorrow() borrowing when user has already a HF < threshold (revert expected)", async () => {
    const {pool, users, dai, usdc, oracle, addressesProvider} = testEnv;
    await waitForTx(await addressesProvider.setPriceOracle(oracle.address));

    const user = users[0];
    const depositor = users[1];

    await dai
      .connect(depositor.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "2000"));
    await dai.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(depositor.signer)
      .supply(
        dai.address,
        await convertToCurrencyDecimals(dai.address, "2000"),
        depositor.address,
        0
      );

    await usdc
      .connect(user.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(usdc.address, "2000"));
    await usdc.connect(user.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(user.signer)
      .supply(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, "2000"),
        user.address,
        0
      );

    await pool
      .connect(user.signer)
      .borrow(
        dai.address,
        await convertToCurrencyDecimals(dai.address, "1000"),
        0,
        user.address
      );

    const daiPrice = await oracle.getAssetPrice(dai.address);

    await oracle.setAssetPrice(dai.address, daiPrice.mul(2));

    await expect(
      pool
        .connect(user.signer)
        .borrow(
          dai.address,
          await convertToCurrencyDecimals(dai.address, "200"),
          0,
          user.address
        )
    ).to.be.revertedWith(HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD);
  });
});

describe("pToken: Borrow Cap Changed", () => {
  let testEnv: TestEnv;
  const {INVALID_BORROW_CAP, BORROW_CAP_EXCEEDED} = ProtocolErrors;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      weth,
      pool,
      dai,
      usdc,
      users: [user1],
    } = testEnv;

    const mintedAmount = utils.parseEther("1000000000");
    // minting for main user
    expect(await dai["mint(uint256)"](mintedAmount));
    expect(await weth["mint(uint256)"](mintedAmount));
    expect(await usdc["mint(uint256)"](mintedAmount));

    // minting for lp user
    expect(await dai.connect(user1.signer)["mint(uint256)"](mintedAmount));
    expect(await weth.connect(user1.signer)["mint(uint256)"](mintedAmount));
    expect(await usdc.connect(user1.signer)["mint(uint256)"](mintedAmount));

    expect(await dai.approve(pool.address, MAX_UINT_AMOUNT));
    expect(await weth.approve(pool.address, MAX_UINT_AMOUNT));
    expect(await usdc.approve(pool.address, MAX_UINT_AMOUNT));
    expect(
      await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    expect(
      await weth.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    expect(
      await usdc.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
  });

  it("TC-erc20-borrowCap-01: Reserves should initially have borrow cap disabled (borrowCap = 0)", async () => {
    const {dai, usdc, protocolDataProvider} = testEnv;

    const {borrowCap: usdcBorrowCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {borrowCap: daiBorrowCap} = await protocolDataProvider.getReserveCaps(
      dai.address
    );

    expect(usdcBorrowCap).to.be.equal("0");
    expect(daiBorrowCap).to.be.equal("0");
  });

  it("TC-erc20-borrowCap-02: Borrows 10 variable DAI, 10 variable USDC", async () => {
    const {
      weth,
      pool,
      dai,
      usdc,
      deployer,
      users: [user1],
    } = testEnv;

    const suppliedAmount = "1000";
    const borrowedAmount = "10";

    // Deposit collateral
    expect(
      await pool.supply(
        weth.address,
        await convertToCurrencyDecimals(weth.address, suppliedAmount),
        deployer.address,
        0
      )
    );
    // User 1 deposit more DAI and USDC to be able to borrow
    expect(
      await pool
        .connect(user1.signer)
        .supply(
          dai.address,
          await convertToCurrencyDecimals(dai.address, suppliedAmount),
          user1.address,
          0
        )
    );

    expect(
      await pool
        .connect(user1.signer)
        .supply(
          usdc.address,
          await convertToCurrencyDecimals(dai.address, suppliedAmount),
          user1.address,
          0
        )
    );

    // Borrow
    expect(
      await pool.borrow(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, borrowedAmount),
        0,
        deployer.address
      )
    );

    expect(
      await pool.borrow(
        dai.address,
        await convertToCurrencyDecimals(dai.address, borrowedAmount),
        0,
        deployer.address
      )
    );
  });

  it("TC-erc20-borrowCap-03: Sets the borrow cap for DAI and USDC to 10 Units", async () => {
    const {configurator, dai, usdc, protocolDataProvider} = testEnv;

    const {borrowCap: usdcOldBorrowCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {borrowCap: daiOldBorrowCap} =
      await protocolDataProvider.getReserveCaps(dai.address);

    const newCap = 10;
    expect(await configurator.setBorrowCap(usdc.address, newCap))
      .to.emit(configurator, "BorrowCapChanged")
      .withArgs(usdc.address, daiOldBorrowCap, newCap);
    expect(await configurator.setBorrowCap(dai.address, newCap))
      .to.emit(configurator, "BorrowCapChanged")
      .withArgs(dai.address, usdcOldBorrowCap, newCap);

    const {borrowCap: usdcBorrowCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {borrowCap: daiBorrowCap} = await protocolDataProvider.getReserveCaps(
      dai.address
    );

    expect(usdcBorrowCap).to.be.equal(newCap);
    expect(daiBorrowCap).to.be.equal(newCap);
  });

  it("TC-erc20-borrowCap-04: Tries to borrow any variable DAI or USDC, (> BORROW_CAP) (revert expected)", async () => {
    const {usdc, pool, dai, deployer} = testEnv;
    const borrowedAmount = "10";

    await expect(
      pool.borrow(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, borrowedAmount),
        0,
        deployer.address
      )
    ).to.be.revertedWith(BORROW_CAP_EXCEEDED);

    await expect(
      pool.borrow(
        dai.address,
        await convertToCurrencyDecimals(dai.address, borrowedAmount),
        0,
        deployer.address
      )
    ).to.be.revertedWith(BORROW_CAP_EXCEEDED);
  });

  it("TC-erc20-borrowCap-05: Tries to set the borrow cap for USDC and DAI to > MAX_BORROW_CAP (revert expected)", async () => {
    const {configurator, usdc, dai} = testEnv;
    const newCap = Number(MAX_BORROW_CAP) + 1;

    await expect(
      configurator.setBorrowCap(usdc.address, newCap)
    ).to.be.revertedWith(INVALID_BORROW_CAP);
    await expect(
      configurator.setBorrowCap(dai.address, newCap)
    ).to.be.revertedWith(INVALID_BORROW_CAP);
  });

  it("TC-erc20-borrowCap-06: Sets the borrow cap for DAI and USDC to 120 Units", async () => {
    const {configurator, usdc, dai, protocolDataProvider} = testEnv;
    const newCap = "120";

    const {borrowCap: usdcOldBorrowCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {borrowCap: daiOldBorrowCap} =
      await protocolDataProvider.getReserveCaps(dai.address);

    expect(await configurator.setBorrowCap(usdc.address, newCap))
      .to.emit(configurator, "BorrowCapChanged")
      .withArgs(usdc.address, usdcOldBorrowCap, newCap);
    expect(await configurator.setBorrowCap(dai.address, newCap))
      .to.emit(configurator, "BorrowCapChanged")
      .withArgs(dai.address, daiOldBorrowCap, newCap);

    const {borrowCap: usdcBorrowCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {borrowCap: daiBorrowCap} = await protocolDataProvider.getReserveCaps(
      dai.address
    );

    expect(usdcBorrowCap).to.be.equal(newCap);
    expect(daiBorrowCap).to.be.equal(newCap);
  });

  it("TC-erc20-borrowCap-07: Borrows 10 variable DAI and 10 variable USDC", async () => {
    const {usdc, pool, dai, deployer} = testEnv;

    const borrowedAmount = "10";
    expect(
      await pool.borrow(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, borrowedAmount),
        0,
        deployer.address
      )
    );

    expect(
      await pool.borrow(
        dai.address,
        await convertToCurrencyDecimals(dai.address, borrowedAmount),
        0,
        deployer.address
      )
    );
  });

  it("TC-erc20-borrowCap-08: Sets the borrow cap for WETH to 2 Units", async () => {
    const {configurator, weth, protocolDataProvider} = testEnv;

    const {borrowCap: wethOldBorrowCap} =
      await protocolDataProvider.getReserveCaps(weth.address);

    const newCap = 2;
    expect(await configurator.setBorrowCap(weth.address, newCap))
      .to.emit(configurator, "BorrowCapChanged")
      .withArgs(weth.address, wethOldBorrowCap, newCap);

    const wethBorrowCap = (
      await protocolDataProvider.getReserveCaps(weth.address)
    ).borrowCap;

    expect(wethBorrowCap).to.be.equal(newCap);
  });

  it("TC-erc20-borrowCap-09: Borrows 2 variable WETH (= BORROW_CAP)", async () => {
    const {weth, pool, deployer} = testEnv;

    const borrowedAmount = "2";

    await pool.borrow(
      weth.address,
      await convertToCurrencyDecimals(weth.address, borrowedAmount),
      0,
      deployer.address
    );
  });

  it("TC-erc20-borrowCap-10: Time flies and ETH debt amount goes above the limit due to accrued interests", async () => {
    const {weth, protocolDataProvider} = testEnv;

    // Advance blocks
    await advanceTimeAndBlock(3600);

    const wethData = await protocolDataProvider.getReserveData(weth.address);
    const totalDebt = wethData.totalVariableDebt;
    const wethCaps = await protocolDataProvider.getReserveCaps(weth.address);

    expect(totalDebt).gt(wethCaps.borrowCap);
  });

  it("TC-erc20-borrowCap-11: Tries to borrow any variable ETH (> BORROW_CAP) (revert expected)", async () => {
    const {weth, pool, deployer} = testEnv;

    const borrowedAmount = "1";
    await expect(
      pool.borrow(
        weth.address,
        await convertToCurrencyDecimals(weth.address, borrowedAmount),
        0,
        deployer.address
      )
    ).to.be.revertedWith(BORROW_CAP_EXCEEDED);
  });

  it("TC-erc20-borrowCap-12: Borrows 99 variable DAI and 99 variable USDC (< BORROW_CAP)", async () => {
    const {usdc, pool, dai, deployer} = testEnv;

    const borrowedAmount = "99";
    expect(
      await pool.borrow(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, borrowedAmount),
        0,
        deployer.address
      )
    );

    expect(
      await pool.borrow(
        dai.address,
        await convertToCurrencyDecimals(dai.address, borrowedAmount),
        0,
        deployer.address
      )
    );
  });

  it("TC-erc20-borrowCap-13: Raises the borrow cap for USDC and DAI to 1000 Units", async () => {
    const {configurator, usdc, dai, protocolDataProvider} = testEnv;

    const {borrowCap: usdcOldBorrowCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {borrowCap: daiOldBorrowCap} =
      await protocolDataProvider.getReserveCaps(dai.address);

    const newCap = "1000";
    expect(await configurator.setBorrowCap(usdc.address, newCap))
      .to.emit(configurator, "BorrowCapChanged")
      .withArgs(usdc.address, usdcOldBorrowCap, newCap);
    expect(await configurator.setBorrowCap(dai.address, newCap))
      .to.emit(configurator, "BorrowCapChanged")
      .withArgs(dai.address, daiOldBorrowCap, newCap);

    const {borrowCap: usdcBorrowCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {borrowCap: daiBorrowCap} = await protocolDataProvider.getReserveCaps(
      dai.address
    );

    expect(usdcBorrowCap).to.be.equal(newCap);
    expect(daiBorrowCap).to.be.equal(newCap);
  });

  it("TC-erc20-borrowCap-14: Borrows 100 variable DAI and 100 variable USDC (< BORROW_CAP)", async () => {
    const {usdc, pool, dai, deployer} = testEnv;

    const borrowedAmount = "100";
    expect(
      await pool.borrow(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, borrowedAmount),
        0,
        deployer.address
      )
    );

    expect(
      await pool.borrow(
        dai.address,
        await convertToCurrencyDecimals(dai.address, borrowedAmount),
        0,
        deployer.address
      )
    );
  });

  it("TC-erc20-borrowCap-15: Lowers the borrow cap for USDC and DAI to 200 Units", async () => {
    const {configurator, usdc, dai, protocolDataProvider} = testEnv;

    const {borrowCap: usdcOldBorrowCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {borrowCap: daiOldBorrowCap} =
      await protocolDataProvider.getReserveCaps(dai.address);

    const newCap = "200";
    expect(await configurator.setBorrowCap(usdc.address, newCap))
      .to.emit(configurator, "BorrowCapChanged")
      .withArgs(usdc.address, usdcOldBorrowCap, newCap);
    expect(await configurator.setBorrowCap(dai.address, newCap))
      .to.emit(configurator, "BorrowCapChanged")
      .withArgs(dai.address, daiOldBorrowCap, newCap);

    const {borrowCap: usdcBorrowCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {borrowCap: daiBorrowCap} = await protocolDataProvider.getReserveCaps(
      dai.address
    );

    expect(usdcBorrowCap).to.be.equal(newCap);
    expect(daiBorrowCap).to.be.equal(newCap);
  });

  it("TC-erc20-borrowCap-16: Tries to borrows 100 variable DAI and 100 variable USDC (> BORROW_CAP) (revert expected)", async () => {
    const {usdc, pool, dai, deployer} = testEnv;

    const borrowedAmount = "100";
    await expect(
      pool.borrow(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, borrowedAmount),
        0,
        deployer.address
      )
    ).to.be.revertedWith(BORROW_CAP_EXCEEDED);

    await expect(
      pool.borrow(
        dai.address,
        await convertToCurrencyDecimals(dai.address, borrowedAmount),
        0,
        deployer.address
      )
    ).to.be.revertedWith(BORROW_CAP_EXCEEDED);
  });

  it("TC-erc20-borrowCap-17: Raises the borrow cap for USDC and DAI to MAX_BORROW_CAP", async () => {
    const {configurator, usdc, dai, protocolDataProvider} = testEnv;

    const {borrowCap: usdcOldBorrowCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {borrowCap: daiOldBorrowCap} =
      await protocolDataProvider.getReserveCaps(dai.address);

    const newCap = MAX_BORROW_CAP;
    expect(await configurator.setBorrowCap(usdc.address, newCap))
      .to.emit(configurator, "BorrowCapChanged")
      .withArgs(usdc.address, usdcOldBorrowCap, newCap);
    expect(await configurator.setBorrowCap(dai.address, newCap))
      .to.emit(configurator, "BorrowCapChanged")
      .withArgs(dai.address, daiOldBorrowCap, newCap);

    const {borrowCap: usdcBorrowCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {borrowCap: daiBorrowCap} = await protocolDataProvider.getReserveCaps(
      dai.address
    );

    expect(usdcBorrowCap).to.be.equal(newCap);
    expect(daiBorrowCap).to.be.equal(newCap);
  });

  it("TC-erc20-borrowCap-18: Borrows 100 variable DAI and 100 variable USDC (< BORROW_CAP)", async () => {
    const {usdc, pool, dai, deployer} = testEnv;

    const borrowedAmount = "100";
    expect(
      await pool.borrow(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, borrowedAmount),
        0,
        deployer.address
      )
    );
    expect(
      await pool.borrow(
        dai.address,
        await convertToCurrencyDecimals(dai.address, borrowedAmount),
        0,
        deployer.address
      )
    );
  });
});
