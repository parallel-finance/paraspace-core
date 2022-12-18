import hre from "hardhat";
import {expect} from "chai";
import {BigNumber, utils} from "ethers";
import {increaseTime, timeLatest, waitForTx} from "../helpers/misc-utils";
import {MAX_UINT_AMOUNT, ZERO_ADDRESS} from "../helpers/constants";
import {ProtocolErrors} from "../helpers/types";
import {
  PriceOracleSentinel,
  PriceOracleSentinel__factory,
  SequencerOracle,
  SequencerOracle__factory,
} from "../types";
import {getFirstSigner} from "../helpers/contracts-getters";
import {TestEnv} from "./helpers/make-suite";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import "./helpers/utils/wadraymath";
import {getReserveData, getUserData} from "./helpers/utils/helpers";
import {calcExpectedVariableDebtTokenBalance} from "./helpers/utils/calculations";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {strategyWETH} from "../market-config/reservesConfigs";

describe("PriceOracleSentinel", () => {
  let testEnv: TestEnv;
  const {
    PRICE_ORACLE_SENTINEL_CHECK_FAILED,
    INVALID_HF,
    CALLER_NOT_POOL_ADMIN,
  } = ProtocolErrors;

  let sequencerOracle: SequencerOracle;
  let priceOracleSentinel: PriceOracleSentinel;

  const GRACE_PERIOD = BigNumber.from(60 * 60);

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {addressesProvider, deployer, oracle} = testEnv;

    // Deploy SequencerOracle
    sequencerOracle = await (
      await new SequencerOracle__factory(deployer.signer).deploy(
        deployer.address
      )
    ).deployed();

    priceOracleSentinel = await (
      await new PriceOracleSentinel__factory(await getFirstSigner()).deploy(
        addressesProvider.address,
        sequencerOracle.address,
        GRACE_PERIOD
      )
    ).deployed();

    await waitForTx(await addressesProvider.setPriceOracle(oracle.address));
  });

  it("TC-oracle-sentinel-01 Admin sets a PriceOracleSentinel and activates it for DAI and WETH", async () => {
    const {addressesProvider, poolAdmin} = testEnv;

    expect(
      await addressesProvider
        .connect(poolAdmin.signer)
        .setPriceOracleSentinel(priceOracleSentinel.address)
    )
      .to.emit(addressesProvider, "PriceOracleSentinelUpdated")
      .withArgs(ZERO_ADDRESS, priceOracleSentinel.address);

    expect(await addressesProvider.getPriceOracleSentinel()).to.be.eq(
      priceOracleSentinel.address
    );

    const answer = await sequencerOracle.latestRoundData();
    expect(answer[1]).to.be.eq(0);
    expect(answer[3]).to.be.eq(0);
  });

  it("TC-oracle-sentinel-02 Pooladmin updates grace period for sentinel", async () => {
    const {poolAdmin} = testEnv;

    const newGracePeriod = 0;

    expect(await priceOracleSentinel.getGracePeriod()).to.be.eq(GRACE_PERIOD);
    expect(
      await priceOracleSentinel.connect(poolAdmin.signer).setGracePeriod(0)
    )
      .to.emit(priceOracleSentinel, "GracePeriodUpdated")
      .withArgs(0);
    expect(await priceOracleSentinel.getGracePeriod()).to.be.eq(newGracePeriod);
  });

  it("TC-oracle-sentinel-03 Risk admin updates grace period for sentinel", async () => {
    const {riskAdmin} = testEnv;

    expect(await priceOracleSentinel.getGracePeriod()).to.be.eq(0);
    expect(
      await priceOracleSentinel
        .connect(riskAdmin.signer)
        .setGracePeriod(GRACE_PERIOD)
    )
      .to.emit(priceOracleSentinel, "GracePeriodUpdated")
      .withArgs(GRACE_PERIOD);
    expect(await priceOracleSentinel.getGracePeriod()).to.be.eq(GRACE_PERIOD);
  });

  // set emergency admin
  it("TC-oracle-sentinel-04 User tries to set grace period for sentinel", async () => {
    const {
      users: [user],
    } = testEnv;

    expect(await priceOracleSentinel.getGracePeriod()).to.be.eq(GRACE_PERIOD);
    await expect(
      priceOracleSentinel.connect(user.signer).setGracePeriod(0)
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_RISK_OR_POOL_ADMIN);
    expect(await priceOracleSentinel.getGracePeriod()).to.not.be.eq(0);
  });

  it("TC-oracle-sentinel-05 Pooladmin update the sequencer oracle", async () => {
    const {poolAdmin} = testEnv;

    const newSequencerOracle = ZERO_ADDRESS;

    expect(await priceOracleSentinel.getSequencerOracle()).to.be.eq(
      sequencerOracle.address
    );
    expect(
      await priceOracleSentinel
        .connect(poolAdmin.signer)
        .setSequencerOracle(newSequencerOracle)
    )
      .to.emit(priceOracleSentinel, "SequencerOracleUpdated")
      .withArgs(newSequencerOracle);
    expect(await priceOracleSentinel.getSequencerOracle()).to.be.eq(
      newSequencerOracle
    );

    expect(
      await priceOracleSentinel
        .connect(poolAdmin.signer)
        .setSequencerOracle(sequencerOracle.address)
    )
      .to.emit(priceOracleSentinel, "SequencerOracleUpdated")
      .withArgs(sequencerOracle.address);
    expect(await priceOracleSentinel.getSequencerOracle()).to.be.eq(
      sequencerOracle.address
    );
  });

  it("TC-oracle-sentinel-06 User tries to update sequencer oracle", async () => {
    const {
      users: [user],
    } = testEnv;
    const newSequencerOracle = ZERO_ADDRESS;

    expect(await priceOracleSentinel.getSequencerOracle()).to.be.eq(
      sequencerOracle.address
    );
    await expect(
      priceOracleSentinel
        .connect(user.signer)
        .setSequencerOracle(newSequencerOracle)
    ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
    expect(await priceOracleSentinel.getSequencerOracle()).to.be.eq(
      sequencerOracle.address
    );
  });

  it("TC-oracle-sentinel-07 Tries to liquidate borrower when sequencer is down (HF > 0.95) (revert expected)", async () => {
    const {
      dai,
      weth,
      users: [depositor, borrower, borrower2],
      pool,
      oracle,
      protocolDataProvider,
    } = testEnv;
    //mints DAI to depositor
    await dai
      .connect(depositor.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "2000"));

    //approve protocol to access depositor wallet
    await dai.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT);

    //depositor deposits 2000 DAI
    const amountDAItoDeposit = await convertToCurrencyDecimals(
      dai.address,
      "2000"
    );
    await pool
      .connect(depositor.signer)
      .supply(dai.address, amountDAItoDeposit, depositor.address, "0");

    const amountETHtoDeposit = await convertToCurrencyDecimals(
      weth.address,
      "0.06775"
    );
    for (let i = 0; i < 2; i++) {
      const borrowers = [borrower, borrower2];
      const currBorrower = borrowers[i];

      //mints WETH to borrower
      await weth
        .connect(currBorrower.signer)
        ["mint(uint256)"](amountETHtoDeposit);

      //approve protocol to access borrower wallet
      await weth
        .connect(currBorrower.signer)
        .approve(pool.address, MAX_UINT_AMOUNT);

      //borrower deposits 0.06775 WETH
      await pool
        .connect(currBorrower.signer)
        .supply(weth.address, amountETHtoDeposit, currBorrower.address, "0");

      // and borrows
      const amountDAIToBorrow = await convertToCurrencyDecimals(
        dai.address,
        "60"
      );
      await pool
        .connect(currBorrower.signer)
        .borrow(dai.address, amountDAIToBorrow, "0", currBorrower.address);
    }

    // Kill sequencer and drop health factor below 1
    const daiPrice = await oracle.getAssetPrice(dai.address);
    await oracle.setAssetPrice(dai.address, daiPrice.percentMul(11000));
    const userGlobalData = await pool.getUserAccountData(borrower.address);

    // assure correct HF
    expect(userGlobalData.healthFactor).to.be.lt(
      utils.parseUnits("1", 18),
      INVALID_HF
    );
    expect(userGlobalData.healthFactor).to.be.gt(
      utils.parseUnits("0.95", 18),
      INVALID_HF
    );

    const currAnswer = await sequencerOracle.latestRoundData();
    waitForTx(await sequencerOracle.setAnswer(true, currAnswer[3]));

    await dai["mint(uint256)"](
      await convertToCurrencyDecimals(dai.address, "1000")
    );
    await dai.approve(pool.address, MAX_UINT_AMOUNT);

    const userReserveDataBefore = await getUserData(
      pool,
      protocolDataProvider,
      dai.address,
      borrower.address
    );

    const amountToLiquidate = userReserveDataBefore.currentVariableDebt.div(2);
    await expect(
      pool.liquidateERC20(
        weth.address,
        dai.address,
        borrower.address,
        amountToLiquidate,
        true
      )
    ).to.be.revertedWith(PRICE_ORACLE_SENTINEL_CHECK_FAILED);
  });

  it("TC-oracle-sentinel-08 Liquidates borrower when sequencer is down (HF < 0.95)", async () => {
    const {
      pool,
      dai,
      weth,
      users: [, borrower],
      oracle,
      protocolDataProvider,
      deployer,
    } = testEnv;

    // Drop health factor lower
    const daiPrice = await oracle.getAssetPrice(dai.address);
    await oracle.setAssetPrice(dai.address, daiPrice.percentMul(11000));
    const userGlobalData = await pool.getUserAccountData(borrower.address);

    expect(userGlobalData.healthFactor).to.be.lt(
      utils.parseUnits("0.95", 18),
      INVALID_HF
    );

    await dai["mint(uint256)"](
      await convertToCurrencyDecimals(dai.address, "1000")
    );
    await dai.approve(pool.address, MAX_UINT_AMOUNT);

    const daiReserveDataBefore = await getReserveData(
      protocolDataProvider,
      dai.address
    );
    const ethReserveDataBefore = await getReserveData(
      protocolDataProvider,
      weth.address
    );

    const userReserveDataBefore = await getUserData(
      pool,
      protocolDataProvider,
      dai.address,
      borrower.address
    );

    const userWethReserveDataBefore = await getUserData(
      pool,
      protocolDataProvider,
      weth.address,
      borrower.address
    );

    const amountToLiquidate = userReserveDataBefore.currentVariableDebt.div(2);

    const tx = await pool.liquidateERC20(
      weth.address,
      dai.address,
      borrower.address,
      amountToLiquidate,
      true
    );

    const userReserveDataAfter = await protocolDataProvider.getUserReserveData(
      dai.address,
      borrower.address
    );

    const userWethReserveDataAfter =
      await protocolDataProvider.getUserReserveData(
        weth.address,
        borrower.address
      );

    const daiReserveDataAfter = await getReserveData(
      protocolDataProvider,
      dai.address
    );
    const ethReserveDataAfter = await getReserveData(
      protocolDataProvider,
      weth.address
    );

    const collateralPrice = await oracle.getAssetPrice(weth.address);
    const principalPrice = await oracle.getAssetPrice(dai.address);

    const collateralDecimals = (
      await protocolDataProvider.getReserveConfigurationData(weth.address)
    ).decimals;
    const principalDecimals = (
      await protocolDataProvider.getReserveConfigurationData(dai.address)
    ).decimals;

    const expectedCollateralLiquidated = principalPrice
      .mul(amountToLiquidate)
      .percentMul(strategyWETH.liquidationBonus)
      .mul(BigNumber.from(10).pow(collateralDecimals))
      .div(collateralPrice.mul(BigNumber.from(10).pow(principalDecimals)));

    expect(expectedCollateralLiquidated).to.be.closeTo(
      userWethReserveDataBefore.currentPTokenBalance.sub(
        userWethReserveDataAfter.currentXTokenBalance
      ),
      2,
      "Invalid collateral amount liquidated"
    );

    if (!tx.blockNumber) {
      expect(false, "Invalid block number");
      return;
    }

    const txTimestamp = BigNumber.from(
      (await hre.ethers.provider.getBlock(tx.blockNumber)).timestamp
    );

    const variableDebtBeforeTx = calcExpectedVariableDebtTokenBalance(
      daiReserveDataBefore,
      userReserveDataBefore,
      txTimestamp
    );

    expect(userReserveDataAfter.currentVariableDebt).to.be.closeTo(
      variableDebtBeforeTx.sub(amountToLiquidate),
      2,
      "Invalid user borrow balance after liquidation"
    );

    expect(daiReserveDataAfter.availableLiquidity).to.be.closeTo(
      daiReserveDataBefore.availableLiquidity.add(amountToLiquidate),
      2,
      "Invalid principal available liquidity"
    );

    //the liquidity index of the principal reserve needs to be bigger than the index before
    expect(daiReserveDataAfter.liquidityIndex).to.be.gte(
      daiReserveDataBefore.liquidityIndex,
      "Invalid liquidity index"
    );

    //the principal APY after a liquidation needs to be lower than the APY before
    expect(daiReserveDataAfter.liquidityRate).to.be.lt(
      daiReserveDataBefore.liquidityRate,
      "Invalid liquidity APY"
    );

    expect(ethReserveDataAfter.availableLiquidity).to.be.closeTo(
      ethReserveDataBefore.availableLiquidity,
      2,
      "Invalid collateral available liquidity"
    );

    expect(
      (
        await protocolDataProvider.getUserReserveData(
          weth.address,
          deployer.address
        )
      ).usageAsCollateralEnabled
    ).to.be.true;
  });

  it("TC-oracle-sentinel-09 User tries to borrow with sequencer down (revert expected)", async () => {
    const {
      dai,
      weth,
      users: [, , , user],
      pool,
    } = testEnv;

    await weth
      .connect(user.signer)
      ["mint(uint256)"](utils.parseUnits("0.06775", 18));
    await weth.connect(user.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(user.signer)
      .supply(weth.address, utils.parseUnits("0.06775", 18), user.address, 0);

    await expect(
      pool
        .connect(user.signer)
        .borrow(dai.address, utils.parseUnits("100", 18), 0, user.address)
    ).to.be.revertedWith(PRICE_ORACLE_SENTINEL_CHECK_FAILED);
  });

  it("TC-oracle-sentinel-10 Can turn sequencer back on", async () => {
    expect(
      await waitForTx(
        await sequencerOracle.setAnswer(false, await timeLatest())
      )
    );
  });

  it("TC-oracle-sentinel-11 User tries to borrow with sequencer on but time behind grace period (revert expected)", async () => {
    const {
      dai,
      weth,
      users: [, , , user],
      pool,
    } = testEnv;

    await weth
      .connect(user.signer)
      ["mint(uint256)"](utils.parseUnits("0.06775", 18));
    await weth.connect(user.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(user.signer)
      .supply(weth.address, utils.parseUnits("0.06775", 18), user.address, 0);

    await expect(
      pool
        .connect(user.signer)
        .borrow(dai.address, utils.parseUnits("100", 18), 0, user.address)
    ).to.be.revertedWith(PRICE_ORACLE_SENTINEL_CHECK_FAILED);
  });

  it("TC-oracle-sentinel-12 User tries to borrow with sequencer off and time over grace period (revert expected)", async () => {
    const {
      dai,
      weth,
      users: [, , , user],
      pool,
    } = testEnv;

    // turns off sequencer + increases time over grace period
    const currAnswer = await sequencerOracle.latestRoundData();
    await waitForTx(await sequencerOracle.setAnswer(true, currAnswer[3]));
    await increaseTime(GRACE_PERIOD.mul(2).toNumber());

    await weth
      .connect(user.signer)
      ["mint(uint256)"](utils.parseUnits("0.06775", 18));
    await weth.connect(user.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(user.signer)
      .supply(weth.address, utils.parseUnits("0.06775", 18), user.address, 0);

    await expect(
      pool
        .connect(user.signer)
        .borrow(dai.address, utils.parseUnits("100", 18), 0, user.address)
    ).to.be.revertedWith(PRICE_ORACLE_SENTINEL_CHECK_FAILED);
  });

  it("TC-oracle-sentinel-13 User can borrow with sequencer on and time over grace period", async () => {
    const {
      dai,
      weth,
      users: [, , , user],
      pool,
    } = testEnv;

    // Turn on sequencer + increase time past grace period
    await waitForTx(await sequencerOracle.setAnswer(false, await timeLatest()));
    await increaseTime(GRACE_PERIOD.mul(2).toNumber());

    await weth
      .connect(user.signer)
      ["mint(uint256)"](utils.parseUnits("0.06775", 18));
    await weth.connect(user.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(user.signer)
      .supply(weth.address, utils.parseUnits("0.06775", 18), user.address, 0);

    expect(
      await waitForTx(
        await pool
          .connect(user.signer)
          .borrow(dai.address, utils.parseUnits("100", 18), 0, user.address)
      )
    );
  });

  it("TC-oracle-sentinel-14 Can liquidate borrower when sequencer is up again", async () => {
    const {
      pool,
      dai,
      weth,
      users: [, , borrower],
      oracle,
      protocolDataProvider,
      deployer,
    } = testEnv;

    // increase health factor
    const daiPrice = await oracle.getAssetPrice(dai.address);
    await oracle.setAssetPrice(dai.address, daiPrice.percentMul(9500));
    const userGlobalData = await pool.getUserAccountData(borrower.address);

    expect(userGlobalData.healthFactor).to.be.lt(
      utils.parseUnits("1", 18),
      INVALID_HF
    );

    await dai["mint(uint256)"](
      await convertToCurrencyDecimals(dai.address, "1000")
    );
    await dai.approve(pool.address, MAX_UINT_AMOUNT);

    const daiReserveDataBefore = await getReserveData(
      protocolDataProvider,
      dai.address
    );
    const ethReserveDataBefore = await getReserveData(
      protocolDataProvider,
      weth.address
    );

    const userReserveDataBefore = await getUserData(
      pool,
      protocolDataProvider,
      dai.address,
      borrower.address
    );

    const userWethReserveDataBefore = await getUserData(
      pool,
      protocolDataProvider,
      weth.address,
      borrower.address
    );

    const amountToLiquidate = userReserveDataBefore.currentVariableDebt.div(2);

    // The supply is the same, but there should be a change in who has what. The liquidator should have received what the borrower lost.
    const tx = await pool.liquidateERC20(
      weth.address,
      dai.address,
      borrower.address,
      amountToLiquidate,
      true
    );

    const userReserveDataAfter = await protocolDataProvider.getUserReserveData(
      dai.address,
      borrower.address
    );

    const userWethReserveDataAfter =
      await protocolDataProvider.getUserReserveData(
        weth.address,
        borrower.address
      );

    const daiReserveDataAfter = await getReserveData(
      protocolDataProvider,
      dai.address
    );
    const ethReserveDataAfter = await getReserveData(
      protocolDataProvider,
      weth.address
    );

    const collateralPrice = await oracle.getAssetPrice(weth.address);
    const principalPrice = await oracle.getAssetPrice(dai.address);

    const collateralDecimals = (
      await protocolDataProvider.getReserveConfigurationData(weth.address)
    ).decimals;
    const principalDecimals = (
      await protocolDataProvider.getReserveConfigurationData(dai.address)
    ).decimals;

    const expectedCollateralLiquidated = principalPrice
      .mul(amountToLiquidate)
      .percentMul(strategyWETH.liquidationBonus)
      .mul(BigNumber.from(10).pow(collateralDecimals))
      .div(collateralPrice.mul(BigNumber.from(10).pow(principalDecimals)));

    expect(expectedCollateralLiquidated).to.be.closeTo(
      userWethReserveDataBefore.currentPTokenBalance.sub(
        userWethReserveDataAfter.currentXTokenBalance
      ),
      2,
      "Invalid collateral amount liquidated"
    );

    if (!tx.blockNumber) {
      expect(false, "Invalid block number");
      return;
    }

    const txTimestamp = BigNumber.from(
      (await hre.ethers.provider.getBlock(tx.blockNumber)).timestamp
    );

    const variableDebtBeforeTx = calcExpectedVariableDebtTokenBalance(
      daiReserveDataBefore,
      userReserveDataBefore,
      txTimestamp
    );

    expect(userReserveDataAfter.currentVariableDebt).to.be.closeTo(
      variableDebtBeforeTx.sub(amountToLiquidate),
      2,
      "Invalid user borrow balance after liquidation"
    );

    expect(daiReserveDataAfter.availableLiquidity).to.be.closeTo(
      daiReserveDataBefore.availableLiquidity.add(amountToLiquidate),
      2,
      "Invalid principal available liquidity"
    );

    //the liquidity index of the principal reserve needs to be bigger than the index before
    expect(daiReserveDataAfter.liquidityIndex).to.be.gte(
      daiReserveDataBefore.liquidityIndex,
      "Invalid liquidity index"
    );

    //the principal APY after a liquidation needs to be lower than the APY before
    expect(daiReserveDataAfter.liquidityRate).to.be.lt(
      daiReserveDataBefore.liquidityRate,
      "Invalid liquidity APY"
    );

    expect(ethReserveDataAfter.availableLiquidity).to.be.closeTo(
      ethReserveDataBefore.availableLiquidity,
      2,
      "Invalid collateral available liquidity"
    );

    expect(
      (
        await protocolDataProvider.getUserReserveData(
          weth.address,
          deployer.address
        )
      ).usageAsCollateralEnabled
    ).to.be.true;
  });
});
