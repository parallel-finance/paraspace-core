import {expect} from "chai";
import {BigNumber, utils} from "ethers";
import {
  borrowAndValidate,
  changePriceAndValidate,
  liquidateAndValidate,
  liquidateAndValidateReverted,
  mintAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {ProtocolErrors} from "../deploy/helpers/types";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {
  convertToCurrencyDecimals,
  isBorrowing,
} from "../deploy/helpers/contracts-helpers";

const fixture = async () => {
  const testEnv = await loadFixture(testEnvFixture);
  const {
    users: [borrower, liquidator],
    dai,
    weth,
    wBTC,
    usdc,
  } = testEnv;

  // set asset price to assure ltv/health factor calculations
  await changePriceAndValidate(dai, "1"); // 1 DAI = 1 ETH
  await changePriceAndValidate(wBTC, "1"); // 1 wBTC = 1 ETH
  await changePriceAndValidate(usdc, "0.5"); // 1 USDC = 0.5 ETH

  // Borrower deposits 100 DAI
  await supplyAndValidate(dai, "100", borrower, true);

  // Mint 100 DAI to liquidator
  await mintAndValidate(dai, "100", liquidator);
  // Mint 200 wETH and supply 100 wETH to liquidator
  await supplyAndValidate(weth, "100", liquidator, true, "200");
  // Liquidator supplies 50 wBTC
  await supplyAndValidate(wBTC, "50", liquidator, true);
  // Liquidator supplies 20 USDC
  await supplyAndValidate(usdc, "20", liquidator, true);

  // Borrower borrows 65 wETH
  await borrowAndValidate(weth, "65", borrower);

  // HF = 100 * 1 * 0.8 / 65 = 1.2307692307692307692

  return testEnv;
};

describe("ERC-20 Liquidation Tests", () => {
  it("TC-erc20-liquidation-01 Liquidator tries to liquidate a healthy position (HF ~ 1.0 - 1.1) (should be reverted)", async () => {
    const {
      users: [borrower, liquidator],
      dai,
      weth,
    } = await loadFixture(fixture);

    // drop DAI price to near liquidation limit (HF ~ 1.0 - 1.1)
    await changePriceAndValidate(dai, "0.85");

    await liquidateAndValidateReverted(
      dai,
      weth,
      "100",
      liquidator,
      borrower,
      false,
      ProtocolErrors.HEALTH_FACTOR_NOT_BELOW_THRESHOLD
    );
  });

  it("TC-erc20-liquidation-02 Liquidator tries to liquidate with non-borrowed token (revert expected)", async () => {
    const {
      users: [borrower, liquidator],
      dai,
    } = await loadFixture(fixture);
    await changePriceAndValidate(dai, "0.80");

    // try to liquidate with DAI
    await liquidateAndValidateReverted(
      dai,
      dai,
      "100",
      liquidator,
      borrower,
      false,
      ProtocolErrors.SPECIFIED_CURRENCY_NOT_BORROWED_BY_USER
    );
  });

  it("TC-erc20-liquidation-03 Liquidator tries to liquidate a different collateral than the borrower collateral (revert expected)", async () => {
    const {
      users: [borrower, liquidator],
      weth,
      dai,
    } = await loadFixture(fixture);
    await changePriceAndValidate(dai, "0.80");

    // try to liquidate wETH
    await liquidateAndValidateReverted(
      weth,
      weth,
      "100",
      liquidator,
      borrower,
      false,
      ProtocolErrors.COLLATERAL_CANNOT_BE_AUCTIONED_OR_LIQUIDATED
    );
  });

  it("TC-erc20-liquidation-04 Liquidator tries to liquidate a non-active token (revert expected)", async () => {
    const {
      configurator,
      weth,
      ape,
      users: [borrower, liquidator],
      dai,
    } = await loadFixture(fixture);
    await changePriceAndValidate(dai, "0.80");

    // disable APE reserve
    await configurator.setReserveActive(ape.address, false);

    await liquidateAndValidateReverted(
      ape,
      weth,
      "100",
      liquidator,
      borrower,
      false,
      "2"
    );
  });

  it("TC-erc20-liquidation-05 Liquidator tries to liquidate by using a non-active token (revert expected)", async () => {
    const {
      configurator,
      ape,
      users: [borrower, liquidator],
      dai,
    } = await loadFixture(fixture);
    await changePriceAndValidate(dai, "0.80");

    // disable APE reserve
    await configurator.setReserveActive(ape.address, false);

    await liquidateAndValidateReverted(
      dai,
      ape,
      "100",
      liquidator,
      borrower,
      false,
      "2"
    );
  });

  it("TC-erc20-liquidation-06 Liquidator liquidates half of global debt and get pToken (closeFactor = 0.5)", async () => {
    const {
      weth,
      users: [borrower, liquidator],
      dai,
    } = await loadFixture(fixture);
    await changePriceAndValidate(dai, "0.80");
    // supplied 100 DAI and borrowed 65 WETH
    // HF = 100 * 0.8 * 0.8 / 65 = 0.98461538461538461538

    await liquidateAndValidate(
      dai,
      weth,
      "100",
      liquidator,
      borrower,
      true // get pToken
    );
  });

  it("TC-erc20-liquidation-07 Liquidator liquidates full global debt and get underlyingAsset (closeFactor <= 0.95)", async () => {
    const {
      weth,
      users: [borrower, liquidator],
      dai,
      pool,
    } = await loadFixture(fixture);
    // HF = 100 * 0.8 * 1 / 65 = 1.2307692307692307692
    await borrowAndValidate(weth, "5", borrower);
    // supplied 100 DAI and borrowed 70 WETH
    // HF = 100 * 0.8 * 1 / 70 = 1.1428571428571428571

    await changePriceAndValidate(dai, "0.80");
    // HF = 100 * 0.8 * 0.8 / 70 = 0.91428571428571428571

    await liquidateAndValidate(
      dai,
      weth,
      "71", // pays total debt of 70 (65 + 5)
      liquidator,
      borrower,
      false
    );

    // global debt should be 0
    expect(
      (await pool.getUserAccountData(borrower.address)).totalDebtBase
    ).to.eq(0);
  });

  it("TC-erc20-liquidation-08 Liquidator liquidates full token debt but partial global debt", async () => {
    const {
      weth,
      users: [borrower, liquidator],
      dai,
      wBTC,
      pool,
      variableDebtWeth,
    } = await loadFixture(fixture);
    await borrowAndValidate(wBTC, "5", borrower);
    // supplied 100 DAI and borrowed 65 WETH and 5 WBTC
    // HF = 100 * 0.8 * 1 / (65 + 5) = 1.1428571428571428571

    await changePriceAndValidate(dai, "0.80");
    // HF = 100 * 0.8 * 0.8 / (65 + 5) = 0.91428571428571428571

    const wethData = await pool.getReserveData(weth.address);
    const userConfigBefore = BigNumber.from(
      (await pool.getUserConfiguration(borrower.address)).data
    );

    await liquidateAndValidate(
      dai,
      weth,
      "66", // repays total wETH debt of 65
      liquidator,
      borrower,
      false
    );

    // global debt should be > 0
    expect(
      (await pool.getUserAccountData(borrower.address)).totalDebtBase
    ).to.be.gt(0);
    // WETH token debt should be 0
    expect(await variableDebtWeth.balanceOf(borrower.address)).to.eq(0);

    const userConfigAfter = BigNumber.from(
      (await pool.getUserConfiguration(borrower.address)).data
    );

    // asset should be set as not borrowing in config
    expect(isBorrowing(userConfigBefore, wethData.id)).to.be.true;
    expect(isBorrowing(userConfigAfter, wethData.id)).to.be.false;
  });

  it("TC-erc20-liquidation-09 Liquidator partially liquidates token debt", async () => {
    const {
      weth,
      users: [borrower, liquidator],
      dai,
      variableDebtWeth,
    } = await loadFixture(fixture);
    await changePriceAndValidate(dai, "0.75");
    // HF = 100 * 0.8 * 0.75 / 65 = 0.92307692307692307692

    await liquidateAndValidate(
      dai,
      weth,
      "45", // repays partially the total of 65 wETH debt
      liquidator,
      borrower,
      false
    );

    // DAI token debt should be > 0
    expect(await variableDebtWeth.balanceOf(borrower.address)).to.be.gt(0);
  });

  it("TC-erc20-liquidation-10 Liquidate user with one ERC-20 and multiple ERC-20 borrowed positions", async () => {
    const {
      weth,
      users: [borrower, liquidator],
      dai,
      wBTC,
      usdc,
    } = await loadFixture(fixture);
    await borrowAndValidate(wBTC, "2", borrower);
    await borrowAndValidate(usdc, "5", borrower);

    await changePriceAndValidate(dai, "0.80");
    // HF = 100 * 0.8 * 0.8 / (65 + 2 + 0.5 * 5) = 0.92086330935251798561

    await liquidateAndValidate(dai, weth, "65", liquidator, borrower, false);
  });

  it("TC-erc20-liquidation-11 Liquidate user with multiple ERC-20 and one ERC-20 borrowed position", async () => {
    const {
      weth,
      users: [borrower, liquidator],
      dai,
      wBTC,
      usdc,
    } = await loadFixture(fixture);
    await supplyAndValidate(wBTC, "5", borrower, true);
    await supplyAndValidate(usdc, "10", borrower, true);

    await changePriceAndValidate(dai, "0.60");
    // HF = (100 * 0.8 * 0.6 + 5 * 0.75 + 10 * 0.85) / 65 = 0.92692307692307692308

    await liquidateAndValidate(dai, weth, "65", liquidator, borrower, false);
  });

  it("TC-erc20-liquidation-12 Liquidate user with multiple ERC-20 and multiple ERC-20 borrowed positions", async () => {
    const {
      weth,
      users: [borrower, liquidator],
      dai,
      wBTC,
      usdc,
    } = await loadFixture(fixture);
    await supplyAndValidate(wBTC, "5", borrower, true);
    await supplyAndValidate(usdc, "10", borrower, true);

    await borrowAndValidate(wBTC, "5", borrower);
    await borrowAndValidate(usdc, "10", borrower);

    await changePriceAndValidate(dai, "0.70");
    // HF = (100 * 0.8 * 0.7 + 5 * 0.75 + 10 * 0.85) / (65  + 5 + 0.5 * 10) = 0.91

    await liquidateAndValidate(dai, weth, "65", liquidator, borrower, true);
  });

  it("TC-erc20-liquidation-13 Liquidator liquidates full ERC-20 debt - with a protocol fee of 10%", async () => {
    const {
      configurator,
      protocolDataProvider,
      weth,
      users: [borrower, liquidator],
      dai,
    } = await loadFixture(fixture);

    const oldDAILiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(dai.address);
    const daiLiquidationProtocolFeeInput = 1000;

    // set DAI liquidation fee
    expect(
      await configurator.setLiquidationProtocolFee(
        dai.address,
        daiLiquidationProtocolFeeInput
      )
    )
      .to.emit(configurator, "LiquidationProtocolFeeChanged")
      .withArgs(
        dai.address,
        oldDAILiquidationProtocolFee,
        daiLiquidationProtocolFeeInput
      );

    const daiLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(dai.address);
    expect(daiLiquidationProtocolFee).to.be.equal(
      daiLiquidationProtocolFeeInput
    );

    await changePriceAndValidate(dai, "0.75");
    // HF = 100 * 0.8 * 0.75 / 65 = 0.92307692307692307692

    await liquidateAndValidate(dai, weth, "75", liquidator, borrower, true);
  });

  it("TC-erc20-liquidation-14 Liquidator liquidates partial ERC-20 debt - with a protocol fee of 10%", async () => {
    const {
      configurator,
      weth,
      users: [borrower, liquidator],
      dai,
      pDai,
      protocolDataProvider,
    } = await loadFixture(fixture);
    const daiLiquidationProtocolFeeInput = 1000;
    // set DAI liquidation fee
    await configurator.setLiquidationProtocolFee(
      dai.address,
      daiLiquidationProtocolFeeInput
    );

    await changePriceAndValidate(dai, "0.75");
    // HF = 100 * 0.8 * 0.75 / 65 = 0.92307692307692307692

    const treasuryAddress = await pDai.RESERVE_TREASURY_ADDRESS();
    const treasuryDataBefore = await protocolDataProvider.getUserReserveData(
      dai.address,
      treasuryAddress
    );
    const treasuryBalanceBefore = treasuryDataBefore.currentXTokenBalance;

    await liquidateAndValidate(
      dai,
      weth,
      "45", // partial liquidation
      liquidator,
      borrower,
      true
    );

    const treasuryDataAfter = await protocolDataProvider.getUserReserveData(
      dai.address,
      treasuryAddress
    );
    const treasuryBalanceAfter = treasuryDataAfter.currentXTokenBalance;

    const liquidationAmount = await convertToCurrencyDecimals(
      dai.address,
      "45"
    );
    const liquidationBonus = (
      await protocolDataProvider.getReserveConfigurationData(dai.address)
    ).liquidationBonus;

    const bonusAmount = liquidationAmount.sub(
      liquidationAmount.percentDiv(liquidationBonus)
    );

    const feeAmount = bonusAmount.percentMul(daiLiquidationProtocolFeeInput);

    // 10% went to treasury
    expect(treasuryBalanceAfter).to.be.closeTo(
      treasuryBalanceBefore.add(feeAmount),
      feeAmount
    );
  });

  it("TC-erc20-liquidation-15 Liquidator liquidates all debt by passing 'MAX_INT' amount of WETH", async () => {
    const {
      weth,
      users: [borrower, liquidator],
      dai,
      pool,
    } = await loadFixture(fixture);
    await changePriceAndValidate(dai, "0.75");
    // HF = 100 * 0.8 * 0.75/ 65 = 0.92307692307692307692
    // 100 * 0.75 / 1.05 = 71.428571428571428571

    // liquidate asset
    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .liquidateERC20(
          dai.address,
          weth.address,
          borrower.address,
          MAX_UINT_AMOUNT,
          false,
          {
            gasLimit: 5000000,
          }
        )
    );

    // should've liquidated all debt (max)
    expect(
      (await pool.getUserAccountData(borrower.address)).totalDebtBase
    ).to.eq(0);
    expect(
      (await pool.getUserAccountData(borrower.address)).totalCollateralBase
    ).to.gt(0);
  });

  it("TC-erc20-liquidation-16 Liquidator liquidates all collateral by passing enough amount of ETH", async () => {
    const {
      weth,
      users: [borrower, liquidator],
      dai,
      pool,
      pDai,
      paraspaceOracle,
      protocolDataProvider,
    } = await loadFixture(fixture);
    await changePriceAndValidate(dai, "0.6");
    // HF = 100 * 0.8 * 0.6 / 65 = 0.92307692307692307692
    // 100 * 0.6 / 1.05 = 57.142857142857142857

    const liquidatorBalanceBefore = await liquidator.signer.getBalance();
    const daiCollateralBalance = await pDai.balanceOf(borrower.address);
    // liquidate asset
    const tx = pool
      .connect(liquidator.signer)
      .liquidateERC20(
        dai.address,
        weth.address,
        borrower.address,
        MAX_UINT_AMOUNT,
        false,
        {
          value: utils.parseEther("58").toString(),
          gasLimit: 5000000,
        }
      );
    const txReceipt = await (await tx).wait();
    const gasFee = txReceipt.effectiveGasPrice.mul(txReceipt.gasUsed);
    const liquidatorBalanceAfter = await liquidator.signer.getBalance();

    const collateralAssetPrice = await paraspaceOracle.getAssetPrice(
      dai.address
    );
    const liquidationAssetPrice = await paraspaceOracle.getAssetPrice(
      weth.address
    );
    const liquidationAssetUnit = BigNumber.from("10").pow(
      await weth.decimals()
    );
    const collateralAssetUnit = BigNumber.from("10").pow(await dai.decimals());

    const actualLiquidationAmount = daiCollateralBalance
      .mul(collateralAssetPrice)
      .mul(liquidationAssetUnit)
      .div(liquidationAssetPrice.mul(collateralAssetUnit))
      .percentDiv(
        (await protocolDataProvider.getReserveConfigurationData(dai.address))
          .liquidationBonus
      );

    // should've liquidated all debt (max)
    const userAccountData = await pool.getUserAccountData(borrower.address);
    expect(userAccountData.totalDebtBase).to.gt(0);
    expect(userAccountData.totalCollateralBase).to.eq(0);
    expect(liquidatorBalanceAfter).to.be.eq(
      liquidatorBalanceBefore.sub(gasFee).sub(actualLiquidationAmount)
    );
  });
});
