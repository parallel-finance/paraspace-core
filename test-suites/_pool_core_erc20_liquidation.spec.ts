import {expect} from "chai";
import {BigNumber} from "ethers";
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
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";

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

  it("TC-erc20-liquidation-06 Liquidator requests to get pToken", async () => {
    const {
      weth,
      users: [borrower, liquidator],
      dai,
    } = await loadFixture(fixture);
    await changePriceAndValidate(dai, "0.80");

    await liquidateAndValidate(
      dai,
      weth,
      "100",
      liquidator,
      borrower,
      true // get pToken
    );
  });

  it("TC-erc20-liquidation-07 Liquidator liquidates full global debt", async () => {
    const {
      weth,
      users: [borrower, liquidator],
      dai,
      pool,
    } = await loadFixture(fixture);
    await borrowAndValidate(weth, "5", borrower);

    await changePriceAndValidate(dai, "0.80");

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

    await changePriceAndValidate(dai, "0.80");

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

    const isBorrowing = (conf, id) =>
      conf
        .div(BigNumber.from(2).pow(BigNumber.from(id).mul(2)))
        .and(1)
        .gt(0);

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
    await changePriceAndValidate(dai, "0.80");

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

    await changePriceAndValidate(dai, "0.80");

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

    await changePriceAndValidate(dai, "0.80");

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
      liquidationAmount.mul(10000).div(liquidationBonus)
    );

    const feeAmount = bonusAmount.percentMul(daiLiquidationProtocolFeeInput);

    // 10% went to treasury
    expect(treasuryBalanceAfter).to.be.closeTo(
      treasuryBalanceBefore.add(feeAmount),
      feeAmount
    );
  });

  it("TC-erc20-liquidation-15 Liquidator liquidates max possible amount by passing 'MAX_INT' amount", async () => {
    const {
      weth,
      users: [borrower, liquidator],
      dai,
      pool,
    } = await loadFixture(fixture);
    await changePriceAndValidate(dai, "0.80");

    // liquidate asset
    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .liquidationCall(
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
  });
});
