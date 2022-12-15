import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {parseEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT, ONE_YEAR, MAX_SUPPLY_CAP} from "../helpers/constants";
import {
  convertToCurrencyDecimals,
  impersonateAddress,
} from "../helpers/contracts-helpers";
import {advanceTimeAndBlock} from "../helpers/misc-utils";
import {testEnvFixture} from "./helpers/setup-env";
import {
  assertHealthFactorCalculation,
  mintAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
} from "./helpers/validated-steps";
import {ProtocolErrors} from "../helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {utils} from "ethers";
import {topUpNonPayableWithEther} from "./helpers/utils/funds";

describe("pToken Supply Event Accounting", () => {
  const {RESERVE_FROZEN, RESERVE_INACTIVE, UNDERLYING_BALANCE_ZERO} =
    ProtocolErrors;
  const firstDaiDeposit = "10000";
  const secondDaiDeposit = "20000";

  it("TC-erc20-supply-01 User 1 deposits 10k DAI", async () => {
    const {
      dai,
      users: [user1],
    } = await loadFixture(testEnvFixture);

    // User 2 - Deposit dai
    await supplyAndValidate(dai, firstDaiDeposit, user1, true);
  });

  it("TC-erc20-supply-02 User1 supplies in batches", async () => {
    const {
      dai,
      users: [user1],
    } = await loadFixture(testEnvFixture);

    // User 2 - multiple Deposit dai
    await supplyAndValidate(dai, secondDaiDeposit, user1, true);
    await supplyAndValidate(dai, secondDaiDeposit, user1, true);
  });

  it("TC-erc20-supply-03 User1 shouldn't supply dai more than its allowance (should fail)", async () => {
    const {
      dai,
      pool,
      users: [user1],
    } = await loadFixture(testEnvFixture);
    const amount = await convertToCurrencyDecimals(
      dai.address,
      firstDaiDeposit
    );
    await mintAndValidate(dai, firstDaiDeposit, user1);
    await dai.connect(user1.signer).approve(pool.address, parseEther("5000"));
    await expect(
      pool.connect(user1.signer).supply(dai.address, amount, user1.address, "0")
    ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
  });

  it("TC-erc20-supply-04 User 1 removes the deposited DAI from collateral", async () => {
    const {
      users: [user1],
      dai,
    } = await loadFixture(testEnvFixture);

    // User 1 -  Deposit dai
    await supplyAndValidate(dai, "200", user1, true);

    // User 1 -  close Collateral
    await switchCollateralAndValidate(user1, dai, false);
  });

  it("TC-erc20-supply-05 User 2 tries to supply without obtaining approval (should fail)", async () => {
    const {
      dai,
      pool,
      users: [, user2],
    } = await loadFixture(testEnvFixture);
    await mintAndValidate(dai, firstDaiDeposit, user2);
    await expect(
      pool
        .connect(user2.signer)
        .supply(dai.address, firstDaiDeposit, user2.address, "0")
    ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
  });

  it("TC-erc20-supply-06 User 1 tries to supply 20K exceed the balance amount (should fail)", async () => {
    const {
      dai,
      pool,
      users: [user1],
    } = await loadFixture(testEnvFixture);
    const amount = await convertToCurrencyDecimals(dai.address, "200000");

    await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await expect(
      pool.connect(user1.signer).supply(dai.address, amount, user1.address, "0")
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  });

  it("TC-erc20-supply-07 User 1 Supply not minted token (should fail)", async () => {
    const {
      usdt,
      pool,
      users: [user1],
    } = await loadFixture(testEnvFixture);
    const amount = await convertToCurrencyDecimals(usdt.address, "200000");

    await usdt.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await expect(
      pool
        .connect(user1.signer)
        .supply(usdt.address, amount, user1.address, "0")
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  });

  it("TC-erc20-supply-08 User 1 tries tansfer the pToken to User 2 (no borrow)", async () => {
    const {
      pDai,
      dai,
      users: [user1, user2],
    } = await loadFixture(testEnvFixture);
    await supplyAndValidate(dai, "200", user1, true);
    const user1balance = await pDai.balanceOf(user1.address);
    const user2balance = await pDai.balanceOf(user2.address);
    const amount = await convertToCurrencyDecimals(pDai.address, "100");

    await pDai.connect(user1.signer).transfer(user2.address, amount);
    await switchCollateralAndValidate(user2, dai, true);

    const user1BalanceAfter = await pDai.balanceOf(user1.address);
    const user2BalanceAfter = await pDai.balanceOf(user2.address);

    // user 1 ptoken  should  be reduced
    expect(user1BalanceAfter).to.be.equal(user1balance.sub(amount));

    // user 2 ptoken  should increase
    expect(user2BalanceAfter).to.be.equal(user2balance.add(amount));
  });

  it("TC-erc20-supply-09 Health factor remains the same over time if user has only a ERC-20 supply position", async () => {
    const {
      dai,
      pool,
      users: [user1],
    } = await loadFixture(testEnvFixture);

    // User 1 - Deposit DAI
    await supplyAndValidate(dai, firstDaiDeposit, user1, true);

    const initialHealthFactor = (await pool.getUserAccountData(user1.address))
      .healthFactor;
    await assertHealthFactorCalculation(user1);

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR) * 100);

    // health factor should remain the same
    expect(initialHealthFactor).to.eq(
      (await pool.getUserAccountData(user1.address)).healthFactor
    );
  });

  it("TC-erc20-supply-10 validateSupply() when reserve is not active (revert expected)", async () => {
    const {pool, poolAdmin, configurator, protocolDataProvider, users, dai} =
      await loadFixture(testEnvFixture);
    const user = users[0];

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

    await dai.connect(user.signer)["mint(uint256)"](utils.parseEther("1000"));
    await dai.connect(user.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await expect(
      pool
        .connect(user.signer)
        .supply(dai.address, utils.parseEther("1000"), user.address, 0)
    ).to.be.revertedWith(RESERVE_INACTIVE);
  });

  it("TC-erc20-supply-11 validateSupply() when reserve is frozen (revert expected)", async () => {
    const {pool, poolAdmin, configurator, protocolDataProvider, users, dai} =
      await loadFixture(testEnvFixture);
    const user = users[0];

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

    await dai.connect(user.signer)["mint(uint256)"](utils.parseEther("1000"));
    await dai.connect(user.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await expect(
      pool
        .connect(user.signer)
        .supply(dai.address, utils.parseEther("1000"), user.address, 0)
    ).to.be.revertedWith(RESERVE_FROZEN);
  });

  it("TC-erc20-supply-12 validateSetUseERC20AsCollateral() when reserve is not active (revert expected)", async () => {
    /**
     * Since its not possible to deactivate a reserve with existing suppliers, making the user have
     * xToken balance (pDAI) its not technically possible to end up in this situation.
     * However, we impersonate the Pool to get some pDAI and make the test possible
     */
    const {
      pool,
      configurator,
      protocolDataProvider,
      poolAdmin,
      users,
      dai,
      pDai,
    } = await loadFixture(testEnvFixture);
    const user = users[0];

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

    const poolSigner = (await impersonateAddress(pool.address)).signer;
    await topUpNonPayableWithEther(
      user.signer,
      [pool.address],
      utils.parseEther("1")
    );
    expect(
      await pDai.connect(poolSigner).mint(user.address, user.address, 1, 1)
    );

    await expect(
      pool.connect(user.signer).setUserUseERC20AsCollateral(dai.address, true)
    ).to.be.revertedWith(RESERVE_INACTIVE);

    await expect(
      pool.connect(user.signer).setUserUseERC20AsCollateral(dai.address, false)
    ).to.be.revertedWith(RESERVE_INACTIVE);
  });

  it("TC-erc20-supply-13 validateSetUseERC20AsCollateral() with userBalance == 0 (revert expected)", async () => {
    const {pool, users, dai} = await loadFixture(testEnvFixture);
    const user = users[0];

    await expect(
      pool.connect(user.signer).setUserUseERC20AsCollateral(dai.address, true)
    ).to.be.revertedWith(UNDERLYING_BALANCE_ZERO);

    await expect(
      pool.connect(user.signer).setUserUseERC20AsCollateral(dai.address, false)
    ).to.be.revertedWith(UNDERLYING_BALANCE_ZERO);
  });

  it("TC-erc20-supply-14 Tries to call `finalizeTransfer()` by a non-xToken address (revert expected)", async () => {
    const {pool, dai, users} = await loadFixture(testEnvFixture);

    await expect(
      pool
        .connect(users[0].signer)
        .finalizeTransfer(
          dai.address,
          users[0].address,
          users[1].address,
          false,
          0,
          0,
          0
        )
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_XTOKEN);
  });
});

describe("pToken: Supply Cap Changed", () => {
  let testEnv: TestEnv;
  const {SUPPLY_CAP_EXCEEDED, INVALID_SUPPLY_CAP} = ProtocolErrors;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {weth, pool, dai, usdc} = testEnv;

    const mintedAmount = utils.parseEther("1000000000");
    await dai["mint(uint256)"](mintedAmount);
    await weth["mint(uint256)"](mintedAmount);
    await usdc["mint(uint256)"](mintedAmount);

    await dai.approve(pool.address, MAX_UINT_AMOUNT);
    await weth.approve(pool.address, MAX_UINT_AMOUNT);
    await usdc.approve(pool.address, MAX_UINT_AMOUNT);
  });

  it("TC-erc20-supplyCap-01: Reserves should initially have supply cap disabled (supplyCap = 0)", async () => {
    const {dai, usdc, protocolDataProvider} = testEnv;

    const usdcSupplyCap = (
      await protocolDataProvider.getReserveCaps(usdc.address)
    ).supplyCap;
    const daiSupplyCap = (
      await protocolDataProvider.getReserveCaps(dai.address)
    ).supplyCap;

    expect(usdcSupplyCap).to.be.equal("0");
    expect(daiSupplyCap).to.be.equal("0");
  });

  it("TC-erc20-supplyCap-02: Supply 1000 Dai, 1000 USDC and 1000 WETH", async () => {
    const {weth, pool, dai, usdc, deployer} = testEnv;

    const suppliedAmount = "1000";

    await pool.supply(
      usdc.address,
      await convertToCurrencyDecimals(usdc.address, suppliedAmount),
      deployer.address,
      0
    );

    await pool.supply(
      dai.address,
      await convertToCurrencyDecimals(dai.address, suppliedAmount),
      deployer.address,
      0
    );
    await pool.supply(
      weth.address,
      await convertToCurrencyDecimals(weth.address, suppliedAmount),
      deployer.address,
      0
    );
  });

  it("TC-erc20-supplyCap-03: Sets the supply cap for DAI and USDC to 1000 Unit, leaving 0 Units to reach the limit", async () => {
    const {configurator, dai, usdc, protocolDataProvider} = testEnv;

    const {supplyCap: oldUsdcSupplyCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {supplyCap: oldDaiSupplyCap} =
      await protocolDataProvider.getReserveCaps(dai.address);

    const newCap = "1000";

    expect(await configurator.setSupplyCap(usdc.address, newCap))
      .to.emit(configurator, "SupplyCapChanged")
      .withArgs(usdc.address, oldUsdcSupplyCap, newCap);
    expect(await configurator.setSupplyCap(dai.address, newCap))
      .to.emit(configurator, "SupplyCapChanged")
      .withArgs(dai.address, oldDaiSupplyCap, newCap);

    const {supplyCap: usdcSupplyCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {supplyCap: daiSupplyCap} = await protocolDataProvider.getReserveCaps(
      dai.address
    );

    expect(usdcSupplyCap).to.be.equal(newCap);
    expect(daiSupplyCap).to.be.equal(newCap);
  });

  it("TC-erc20-supplyCap-04: Tries to supply any DAI or USDC (> SUPPLY_CAP) (revert expected)", async () => {
    const {usdc, pool, dai, deployer} = testEnv;
    const suppliedAmount = "10";

    await expect(
      pool.supply(usdc.address, suppliedAmount, deployer.address, 0)
    ).to.be.revertedWith(SUPPLY_CAP_EXCEEDED);

    await expect(
      pool.supply(
        dai.address,
        await convertToCurrencyDecimals(dai.address, suppliedAmount),
        deployer.address,
        0
      )
    ).to.be.revertedWith(SUPPLY_CAP_EXCEEDED);
  });

  it("TC-erc20-supplyCap-05: Tries to set the supply cap for USDC and DAI to > MAX_SUPPLY_CAP (revert expected)", async () => {
    const {configurator, usdc, dai} = testEnv;
    const newCap = Number(MAX_SUPPLY_CAP) + 1;

    await expect(
      configurator.setSupplyCap(usdc.address, newCap)
    ).to.be.revertedWith(INVALID_SUPPLY_CAP);
    await expect(
      configurator.setSupplyCap(dai.address, newCap)
    ).to.be.revertedWith(INVALID_SUPPLY_CAP);
  });

  it("TC-erc20-supplyCap-06: Sets the supply cap for usdc and DAI to 1110 Units, leaving 110 Units to reach the limit", async () => {
    const {configurator, usdc, dai, protocolDataProvider} = testEnv;

    const {supplyCap: oldUsdcSupplyCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {supplyCap: oldDaiSupplyCap} =
      await protocolDataProvider.getReserveCaps(dai.address);

    const newCap = "1110";
    expect(await configurator.setSupplyCap(usdc.address, newCap))
      .to.emit(configurator, "SupplyCapChanged")
      .withArgs(usdc.address, oldUsdcSupplyCap, newCap);
    expect(await configurator.setSupplyCap(dai.address, newCap))
      .to.emit(configurator, "SupplyCapChanged")
      .withArgs(dai.address, oldDaiSupplyCap, newCap);

    const {supplyCap: usdcSupplyCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {supplyCap: daiSupplyCap} = await protocolDataProvider.getReserveCaps(
      dai.address
    );

    expect(usdcSupplyCap).to.be.equal(newCap);
    expect(daiSupplyCap).to.be.equal(newCap);
  });

  it("TC-erc20-supplyCap-07: Supply 10 DAI and 10 USDC, leaving 100 Units to reach the limit", async () => {
    const {usdc, pool, dai, deployer} = testEnv;

    const suppliedAmount = "10";
    await pool.supply(
      usdc.address,
      await convertToCurrencyDecimals(usdc.address, suppliedAmount),
      deployer.address,
      0
    );

    await pool.supply(
      dai.address,
      await convertToCurrencyDecimals(dai.address, suppliedAmount),
      deployer.address,
      0
    );
  });

  it("TC-erc20-supplyCap-08: Tries to supply 101 DAI and 101 USDC (> SUPPLY_CAP) 1 unit above the limit (revert expected)", async () => {
    const {usdc, pool, dai, deployer} = testEnv;

    const suppliedAmount = "101";

    await expect(
      pool.supply(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, suppliedAmount),
        deployer.address,
        0
      )
    ).to.be.revertedWith(SUPPLY_CAP_EXCEEDED);

    await expect(
      pool.supply(
        dai.address,
        await convertToCurrencyDecimals(dai.address, suppliedAmount),
        deployer.address,
        0
      )
    ).to.be.revertedWith(SUPPLY_CAP_EXCEEDED);
  });

  it("TC-erc20-supplyCap-09: Supply 99 DAI and 99 USDC (< SUPPLY_CAP), leaving 1 Units to reach the limit", async () => {
    const {usdc, pool, dai, deployer} = testEnv;

    const suppliedAmount = "99";
    await pool.supply(
      usdc.address,
      await convertToCurrencyDecimals(usdc.address, suppliedAmount),
      deployer.address,
      0
    );

    await pool.supply(
      dai.address,
      await convertToCurrencyDecimals(dai.address, suppliedAmount),
      deployer.address,
      0
    );
  });

  it("TC-erc20-supplyCap-10: Supply 1 DAI and 1 USDC (= SUPPLY_CAP), reaching the limit", async () => {
    const {usdc, pool, dai, deployer} = testEnv;

    const suppliedAmount = "1";
    await pool.supply(
      usdc.address,
      await convertToCurrencyDecimals(usdc.address, suppliedAmount),
      deployer.address,
      0
    );

    await pool.supply(
      dai.address,
      await convertToCurrencyDecimals(dai.address, suppliedAmount),
      deployer.address,
      0
    );
  });

  it("TC-erc20-supplyCap-11: Time flies and DAI and USDC supply amount goes above the limit due to accrued interests", async () => {
    const {usdc, dai, protocolDataProvider} = testEnv;

    // Advance blocks
    await advanceTimeAndBlock(3600);

    const daiData = await protocolDataProvider.getReserveData(dai.address);
    const daiCaps = await protocolDataProvider.getReserveCaps(dai.address);
    const usdcData = await protocolDataProvider.getReserveData(usdc.address);
    const usdcCaps = await protocolDataProvider.getReserveCaps(usdc.address);

    expect(daiData.totalPToken).gt(daiCaps.supplyCap);
    expect(usdcData.totalPToken).gt(usdcCaps.supplyCap);
  });

  it("TC-erc20-supplyCap-12: Raises the supply cap for USDC and DAI to 2000 Units, leaving 800 Units to reach the limit", async () => {
    const {configurator, usdc, dai, protocolDataProvider} = testEnv;

    const {supplyCap: oldUsdcSupplyCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {supplyCap: oldDaiSupplyCap} =
      await protocolDataProvider.getReserveCaps(dai.address);

    const newCap = "2000";
    expect(await configurator.setSupplyCap(usdc.address, newCap))
      .to.emit(configurator, "SupplyCapChanged")
      .withArgs(usdc.address, oldUsdcSupplyCap, newCap);
    expect(await configurator.setSupplyCap(dai.address, newCap))
      .to.emit(configurator, "SupplyCapChanged")
      .withArgs(dai.address, oldDaiSupplyCap, newCap);

    const {supplyCap: usdcSupplyCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {supplyCap: daiSupplyCap} = await protocolDataProvider.getReserveCaps(
      dai.address
    );

    expect(usdcSupplyCap).to.be.equal(newCap);
    expect(daiSupplyCap).to.be.equal(newCap);
  });

  it("TC-erc20-supplyCap-13: Supply 100 DAI and 100 USDC, leaving 700 Units to reach the limit", async () => {
    const {usdc, pool, dai, deployer} = testEnv;

    const suppliedAmount = "100";
    await pool.supply(
      usdc.address,
      await convertToCurrencyDecimals(usdc.address, suppliedAmount),
      deployer.address,
      0
    );

    await pool.supply(
      dai.address,
      await convertToCurrencyDecimals(dai.address, suppliedAmount),
      deployer.address,
      0
    );
  });

  it("TC-erc20-supplyCap-14: Lowers the supply cap for USDC and DAI to 1200 Units (suppliedAmount > supplyCap)", async () => {
    const {configurator, usdc, dai, protocolDataProvider} = testEnv;

    const {supplyCap: oldUsdcSupplyCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {supplyCap: oldDaiSupplyCap} =
      await protocolDataProvider.getReserveCaps(dai.address);

    const newCap = "1200";
    expect(await configurator.setSupplyCap(usdc.address, newCap))
      .to.emit(configurator, "SupplyCapChanged")
      .withArgs(usdc.address, oldUsdcSupplyCap, newCap);
    expect(await configurator.setSupplyCap(dai.address, newCap))
      .to.emit(configurator, "SupplyCapChanged")
      .withArgs(dai.address, oldDaiSupplyCap, newCap);

    const {supplyCap: usdcSupplyCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {supplyCap: daiSupplyCap} = await protocolDataProvider.getReserveCaps(
      dai.address
    );

    expect(usdcSupplyCap).to.be.equal(newCap);
    expect(daiSupplyCap).to.be.equal(newCap);
  });

  it("TC-erc20-supplyCap-15: Tries to supply 100 DAI and 100 USDC (> SUPPLY_CAP) (revert expected)", async () => {
    const {usdc, pool, dai, deployer} = testEnv;

    const suppliedAmount = "100";

    await expect(
      pool.supply(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, suppliedAmount),
        deployer.address,
        0
      )
    ).to.be.revertedWith(SUPPLY_CAP_EXCEEDED);

    await expect(
      pool.supply(
        dai.address,
        await convertToCurrencyDecimals(dai.address, suppliedAmount),
        deployer.address,
        0
      )
    ).to.be.revertedWith(SUPPLY_CAP_EXCEEDED);
  });

  it("TC-erc20-supplyCap-16: Raises the supply cap for USDC and DAI to MAX_SUPPLY_CAP", async () => {
    const {configurator, usdc, dai, protocolDataProvider} = testEnv;

    const {supplyCap: oldUsdcSupplyCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {supplyCap: oldDaiSupplyCap} =
      await protocolDataProvider.getReserveCaps(dai.address);

    const newCap = MAX_SUPPLY_CAP;
    expect(await configurator.setSupplyCap(usdc.address, newCap))
      .to.emit(configurator, "SupplyCapChanged")
      .withArgs(usdc.address, oldUsdcSupplyCap, newCap);
    expect(await configurator.setSupplyCap(dai.address, newCap))
      .to.emit(configurator, "SupplyCapChanged")
      .withArgs(dai.address, oldDaiSupplyCap, newCap);

    const {supplyCap: usdcSupplyCap} =
      await protocolDataProvider.getReserveCaps(usdc.address);
    const {supplyCap: daiSupplyCap} = await protocolDataProvider.getReserveCaps(
      dai.address
    );

    expect(usdcSupplyCap).to.be.equal(newCap);
    expect(daiSupplyCap).to.be.equal(newCap);
  });

  it("TC-erc20-supplyCap-17: Supply 100 DAI and 100 USDC", async () => {
    const {usdc, pool, dai, deployer} = testEnv;

    const suppliedAmount = "100";
    await pool.supply(
      usdc.address,
      await convertToCurrencyDecimals(usdc.address, suppliedAmount),
      deployer.address,
      0
    );

    await pool.supply(
      dai.address,
      await convertToCurrencyDecimals(dai.address, suppliedAmount),
      deployer.address,
      0
    );
  });
});
