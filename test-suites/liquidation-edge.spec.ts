import "./helpers/utils/wadraymath";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {parseEther} from "ethers/lib/utils";
import {
  MAX_UINT_AMOUNT,
  oneEther,
  ZERO_ADDRESS,
} from "../deploy/helpers/constants";
import {
  convertToCurrencyDecimals,
  isBorrowing,
  isUsingAsCollateral,
} from "../deploy/helpers/contracts-helpers";
import {evmRevert, evmSnapshot, waitForTx} from "../deploy/helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import {VariableDebtToken__factory} from "../types";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {
  borrowAndValidate,
  changePriceAndValidate,
  isAssetInCollateral,
  supplyAndValidate,
} from "./helpers/validated-steps";

describe("Pool Liquidation: Edge cases", () => {
  let snap: string;
  let testEnv: TestEnv;

  beforeEach(async () => {
    snap = await evmSnapshot();
  });
  afterEach(async () => {
    await evmRevert(snap);
  });

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
  });

  it("Liquidation liquidated borrower's collateral completely, asset should not be set as collateralized anymore", async () => {
    const {
      pool,
      users,
      configurator,
      dai,
      usdc,
      weth,
      oracle,
      addressesProvider,
    } = testEnv;

    const depositor = users[0];
    const borrower = users[1];

    await waitForTx(
      await configurator.setLiquidationProtocolFee(weth.address, "30")
    );

    await waitForTx(await addressesProvider.setPriceOracle(oracle.address));

    // Deposit dai
    await dai
      .connect(depositor.signer)
      ["mint(uint256)"](
        await convertToCurrencyDecimals(dai.address, "1000000")
      );
    await dai.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(depositor.signer)
      .supply(
        dai.address,
        await convertToCurrencyDecimals(dai.address, "10000"),
        depositor.address,
        0
      );

    // Deposit usdc
    await usdc
      .connect(depositor.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(usdc.address, "10000"));
    await usdc.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(depositor.signer)
      .supply(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, "1000"),
        depositor.address,
        0
      );

    // Deposit eth, borrow dai
    await weth.connect(borrower.signer)["mint(uint256)"](parseEther("2"));
    await weth.connect(borrower.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(borrower.signer)
      .supply(weth.address, parseEther("2"), borrower.address, 0);

    // Borrow usdc
    await pool
      .connect(borrower.signer)
      .borrow(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, "1000"),
        0,
        borrower.address
      );

    // Borrow dai variable
    await pool
      .connect(borrower.signer)
      .borrow(
        dai.address,
        await convertToCurrencyDecimals(dai.address, "100"),
        0,
        borrower.address
      );

    // HF: (2 * 0.85) / (1000 * 0.000915952223931999 + 100 * 0.000908578801039414) = 1.6885011316288047442

    // Increase usdc price to allow liquidation
    const usdcPrice = await oracle.getAssetPrice(usdc.address);
    await oracle.setAssetPrice(usdc.address, usdcPrice.mul(10));

    // HF: (2 * 0.85) / (1000 * 0.00915952223931999 + 100 * 0.000908578801039414) = 0.18377623168483023555

    const usdcData = await pool.getReserveData(usdc.address);
    const wethData = await pool.getReserveData(weth.address);
    const variableDebtToken = VariableDebtToken__factory.connect(
      usdcData.variableDebtTokenAddress,
      depositor.signer
    );

    expect(await variableDebtToken.balanceOf(borrower.address)).to.be.gt(0);

    const userConfigBefore = BigNumber.from(
      (await pool.getUserConfiguration(borrower.address)).data
    );

    expect(
      await pool
        .connect(depositor.signer)
        .liquidateERC20(
          weth.address,
          usdc.address,
          borrower.address,
          MAX_UINT_AMOUNT,
          false,
          {gasLimit: 5000000}
        )
    );

    const userConfigAfter = BigNumber.from(
      (await pool.getUserConfiguration(borrower.address)).data
    );

    expect(await variableDebtToken.balanceOf(borrower.address)).to.be.gt(0);

    expect(isUsingAsCollateral(userConfigBefore, wethData.id)).to.be.true;
    expect(isUsingAsCollateral(userConfigAfter, wethData.id)).to.be.false;

    expect(isBorrowing(userConfigBefore, usdcData.id)).to.be.true;
    expect(isBorrowing(userConfigAfter, usdcData.id)).to.be.true;
  });

  it("Liquidation repay asset completely, asset should not be set as borrowed anymore", async () => {
    const {pool, users, dai, usdc, weth, oracle, addressesProvider} = testEnv;

    const depositor = users[0];
    const borrower = users[1];

    await waitForTx(await addressesProvider.setPriceOracle(oracle.address));

    // Deposit dai
    await dai
      .connect(depositor.signer)
      ["mint(uint256)"](
        await convertToCurrencyDecimals(dai.address, "1000000")
      );
    await dai.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(depositor.signer)
      .supply(
        dai.address,
        await convertToCurrencyDecimals(dai.address, "10000"),
        depositor.address,
        0
      );

    // Deposit usdc
    await usdc
      .connect(depositor.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(usdc.address, "1000"));
    await usdc.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(depositor.signer)
      .supply(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, "1000"),
        depositor.address,
        0
      );

    // Deposit eth, borrow dai
    await weth.connect(borrower.signer)["mint(uint256)"](parseEther("2"));
    await weth.connect(borrower.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(borrower.signer)
      .supply(weth.address, parseEther("2"), borrower.address, 0);

    // Borrow usdc
    await pool
      .connect(borrower.signer)
      .borrow(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, "1000"),
        0,
        borrower.address
      );

    // Borrow dai variable
    await pool
      .connect(borrower.signer)
      .borrow(
        dai.address,
        await convertToCurrencyDecimals(dai.address, "100"),
        0,
        borrower.address
      );

    // HF: (2 * 0.85) / (1000 * 0.000915952223931999 + 100 * 0.000908578801039414) = 1.6885011316288047442

    // Increase usdc price to allow liquidation
    const usdcPrice = await oracle.getAssetPrice(usdc.address);
    await oracle.setAssetPrice(usdc.address, usdcPrice.mul(10));

    // HF: (2 * 0.85) / (10000 * 0.000915952223931999 + 100 * 0.000908578801039414) = 0.18377623168483023555

    const daiData = await pool.getReserveData(dai.address);
    const variableDebtToken = VariableDebtToken__factory.connect(
      daiData.variableDebtTokenAddress,
      depositor.signer
    );

    expect(await variableDebtToken.balanceOf(borrower.address)).to.be.gt(0);

    const userConfigBefore = BigNumber.from(
      (await pool.getUserConfiguration(borrower.address)).data
    );

    expect(
      await pool
        .connect(depositor.signer)
        .liquidateERC20(
          weth.address,
          dai.address,
          borrower.address,
          MAX_UINT_AMOUNT,
          false,
          {gasLimit: 5000000}
        )
    );

    const userConfigAfter = BigNumber.from(
      (await pool.getUserConfiguration(borrower.address)).data
    );

    expect(await variableDebtToken.balanceOf(borrower.address)).to.be.eq(0);

    expect(isBorrowing(userConfigBefore, daiData.id)).to.be.true;
    expect(isBorrowing(userConfigAfter, daiData.id)).to.be.false;
  });

  it("Liquidation with debt left will set liquidation asset as collateral", async () => {
    const {pool, users, bayc, weth, usdc, configurator} = testEnv;

    const depositor = users[0];
    const borrower = users[1];
    const liquidator = users[2];

    await changePriceAndValidate(usdc, "1");
    await changePriceAndValidate(bayc, "100");

    // depositor deposit dai and usdc
    await weth
      .connect(depositor.signer)
      ["mint(uint256)"](
        await convertToCurrencyDecimals(weth.address, "1000000")
      );
    await weth.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(depositor.signer)
      .supply(
        weth.address,
        await convertToCurrencyDecimals(weth.address, "100000"),
        depositor.address,
        0
      );

    await usdc
      .connect(depositor.signer)
      ["mint(uint256)"](
        await convertToCurrencyDecimals(usdc.address, "1000000")
      );
    await usdc.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(depositor.signer)
      .supply(
        usdc.address,
        await convertToCurrencyDecimals(usdc.address, "100000"),
        depositor.address,
        0
      );
    expect(await isAssetInCollateral(depositor, weth.address)).to.be.true;
    expect(await isAssetInCollateral(depositor, usdc.address)).to.be.true;

    // borrower deposit 1 dai
    await weth
      .connect(borrower.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(weth.address, "1"));
    await weth.connect(borrower.signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(borrower.signer)
      .supply(
        weth.address,
        await convertToCurrencyDecimals(weth.address, "1"),
        borrower.address,
        0
      );

    // after the initial supply from borrower dai will be set as collateral
    expect(await isAssetInCollateral(borrower, weth.address)).to.be.true;

    //then we supply bayc
    await supplyAndValidate(bayc, "1", borrower, true);

    // then borrow only 1 weth and 10 usdc
    await borrowAndValidate(weth, "1", borrower);
    await borrowAndValidate(usdc, "10", borrower);

    // HF: (0.85 * 1 + 0.7 * 100) / (11) = 6.4409090909090909091
    // ERC721HF : (0.7 * 100) / Math.max(11 - 0.85 * 1, 0) = 6.8965

    // assert HF>1 and 721HF>1
    const healthFactorBefore = (await pool.getUserAccountData(borrower.address))
      .healthFactor;
    const erc721HealthFactorBefore = (
      await pool.getUserAccountData(borrower.address)
    ).erc721HealthFactor;
    expect(healthFactorBefore).to.be.gt(oneEther, "Invalid health factor");
    expect(erc721HealthFactorBefore).to.be.gt(
      oneEther,
      "Invalid health factor"
    );

    // then we set weth not as collateral since HF<1
    await pool
      .connect(borrower.signer)
      .setUserUseERC20AsCollateral(weth.address, false);
    expect(await isAssetInCollateral(borrower, weth.address)).to.be.false;

    //then we set bayc with lower price to make HF<1 and 721HF<1 ready for liquidate
    await changePriceAndValidate(bayc, "15");
    // HF: (0.7 * 15) / (11) = 0.95454545454545454545
    // ERC721HF : (0.7 * 15) / Math.max(11, 0) = 0.9545454545454546

    const userAccountData = await pool.getUserAccountData(borrower.address);
    const healthFactorAfter = userAccountData.healthFactor;
    const erc721HealthFactorAfter = userAccountData.erc721HealthFactor;
    expect(healthFactorAfter).to.be.lt(oneEther, "Invalid health factor");
    expect(erc721HealthFactorAfter).to.be.lt(oneEther, "Invalid health factor");

    // mint weth to liquidator and supply
    await weth
      .connect(liquidator.signer)
      ["mint(uint256)"](await convertToCurrencyDecimals(weth.address, "10000"));
    await weth
      .connect(liquidator.signer)
      .approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(liquidator.signer)
      .supply(
        weth.address,
        await convertToCurrencyDecimals(weth.address, "1000"),
        borrower.address,
        0
      );

    // then we disable auction to make things simple
    await waitForTx(
      await configurator.setReserveAuctionStrategyAddress(
        bayc.address,
        ZERO_ADDRESS
      )
    );

    //then we liquidate bayc with weth and global debt partially repay
    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .liquidateERC721(
          bayc.address,
          borrower.address,
          0,
          await convertToCurrencyDecimals(weth.address, "15"),
          false,
          {gasLimit: 5000000}
        )
    );
    expect(await isAssetInCollateral(borrower, weth.address)).to.be.true;
  });
});
