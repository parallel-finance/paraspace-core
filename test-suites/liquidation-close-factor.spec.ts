import "./helpers/utils/wadraymath";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {parseEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {
  convertToCurrencyDecimals,
  isBorrowing,
} from "../deploy/helpers/contracts-helpers";
import {evmRevert, evmSnapshot} from "../deploy/helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import {VariableDebtToken__factory} from "../types";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {getMockAggregator} from "../deploy/helpers/contracts-getters";
import {almostEqual} from "../deploy/helpers/uniswapv3-helper";

describe("Pool Liquidation: Close Factor", () => {
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

  it("HF > 0.95 thus only half of the debt has been liquidated although the input is MAX_UINT_AMOUNT", async () => {
    const {
      pool,
      users: [depositor, borrower],
      dai,
      usdc,
      weth,
    } = testEnv;
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
    const usdcAgg = await getMockAggregator(undefined, "USDC");
    const newUsdcPrice = parseEther("0.00169").toString();
    await usdcAgg.updateLatestAnswer(newUsdcPrice);

    // HF: (2 * 0.85) / (1000 * 0.00169 + 100 * 0.000908578801039414) = 0.95459610729901587889

    const daiData = await pool.getReserveData(dai.address);
    const variableDebtToken = VariableDebtToken__factory.connect(
      daiData.variableDebtTokenAddress,
      depositor.signer
    );

    const debtBefore = await variableDebtToken.balanceOf(borrower.address);
    const userConfigBefore = BigNumber.from(
      (await pool.getUserConfiguration(borrower.address)).data
    );

    // liquidate maximum half of the whole debt
    expect(
      await pool
        .connect(depositor.signer)
        .liquidationCall(
          weth.address,
          dai.address,
          borrower.address,
          MAX_UINT_AMOUNT,
          false,
          {gasLimit: 5000000}
        )
    );

    const debtAfter = await variableDebtToken.balanceOf(borrower.address);
    const userConfigAfter = BigNumber.from(
      (await pool.getUserConfiguration(borrower.address)).data
    );

    almostEqual(debtBefore.sub(debtBefore.percentMul("5000")), debtAfter);
    expect(isBorrowing(userConfigBefore, daiData.id)).to.be.true;
    expect(isBorrowing(userConfigAfter, daiData.id)).to.be.true;
  });

  it("HF < 0.95 thus all of the debt has been liquidated", async () => {
    const {
      pool,
      users: [depositor, borrower],
      dai,
      usdc,
      weth,
    } = testEnv;
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
    const usdcAgg = await getMockAggregator(undefined, "USDC");
    const newUsdcPrice = parseEther("0.00170").toString();
    await usdcAgg.updateLatestAnswer(newUsdcPrice);

    // HF: (2 * 0.85) / (1000 * 0.00170 + 100 * 0.000908578801039414) = 0.94926572280617376059

    const daiData = await pool.getReserveData(dai.address);
    const variableDebtToken = VariableDebtToken__factory.connect(
      daiData.variableDebtTokenAddress,
      depositor.signer
    );

    const debtBefore = await variableDebtToken.balanceOf(borrower.address);
    const userConfigBefore = BigNumber.from(
      (await pool.getUserConfiguration(borrower.address)).data
    );

    // liquidate maximum half of the whole debt
    expect(
      await pool
        .connect(depositor.signer)
        .liquidationCall(
          weth.address,
          dai.address,
          borrower.address,
          MAX_UINT_AMOUNT,
          false,
          {gasLimit: 5000000}
        )
    );

    const debtAfter = await variableDebtToken.balanceOf(borrower.address);
    const userConfigAfter = BigNumber.from(
      (await pool.getUserConfiguration(borrower.address)).data
    );

    expect(debtBefore).to.be.gt(0);
    expect(debtAfter).to.be.eq(0);
    expect(isBorrowing(userConfigBefore, daiData.id)).to.be.true;
    expect(isBorrowing(userConfigAfter, daiData.id)).to.be.false;
  });
});
