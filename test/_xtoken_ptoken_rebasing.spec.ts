import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {MAX_UINT_AMOUNT, ONE_YEAR} from "../helpers/constants";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

describe("Rebasing tokens", async () => {
  let testEnv: TestEnv;
  const rebasingIndex = "1080000000000000000000000000";
  const oneRAY = "1000000000000000000000000000";

  let supplyAmountBaseUnits;
  let userStETHAmount;
  let borrowAmountBaseUnits;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {stETH, weth} = testEnv;

    supplyAmountBaseUnits = await convertToCurrencyDecimals(
      weth.address,
      "80000"
    );
    userStETHAmount = await convertToCurrencyDecimals(stETH.address, "1");
    borrowAmountBaseUnits = await convertToCurrencyDecimals(stETH.address, "1");
  });

  it("TC-ptoken-rebasing-01 Should be able to supply stETH and mint rebasing PToken", async () => {
    const {
      users: [user1],
      pool,
      stETH,
      pstETH,
    } = testEnv;

    await waitForTx(
      await stETH.connect(user1.signer)["mint(uint256)"](userStETHAmount)
    );

    await stETH.setPooledEthBaseShares(rebasingIndex);

    await waitForTx(
      await stETH.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await pool
        .connect(user1.signer)
        .supply(stETH.address, userStETHAmount, user1.address, "0", {
          gasLimit: 12_450_000,
        })
    );

    expect(await stETH.balanceOf(user1.address)).to.eq(0);
    expect(await pstETH.balanceOf(user1.address)).to.be.gte(userStETHAmount);
  });

  it("TC-ptoken-rebasing-02 Expect the scaled balance to be the principal balance multiplied by Lido pool shares divided by RAY (2^27)", async () => {
    const {
      users: [user1],
      pstETH,
    } = testEnv;

    expect(await pstETH.scaledBalanceOf(user1.address)).to.be.eq(
      BigNumber.from(rebasingIndex).mul(userStETHAmount).div(oneRAY)
    );
  });

  it("TC-ptoken-rebasing-03 Expect the balance of supplier to accrue both stETH and pstETH interest", async () => {
    const {
      users: [user1, user2],
      pool,
      stETH,
      pstETH,
      weth,
      variableDebtStETH,
    } = testEnv;

    await waitForTx(
      await weth.connect(user2.signer)["mint(uint256)"](supplyAmountBaseUnits)
    );

    await waitForTx(
      await weth.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(weth.address, supplyAmountBaseUnits, user2.address, "0", {
          gasLimit: 12_450_000,
        })
    );

    await waitForTx(
      await pool
        .connect(user2.signer)
        .borrow(stETH.address, borrowAmountBaseUnits, "0", user2.address, {
          gasLimit: 12_450_000,
        })
    );

    expect(await pstETH.balanceOf(user1.address)).to.be.eq(
      BigNumber.from(rebasingIndex).mul(userStETHAmount).div(oneRAY)
    );

    expect(await variableDebtStETH.balanceOf(user2.address)).to.be.eq(
      BigNumber.from(rebasingIndex).mul(borrowAmountBaseUnits).div(oneRAY)
    );

    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    expect(await pstETH.balanceOf(user1.address)).to.be.gt(
      BigNumber.from(rebasingIndex).mul(userStETHAmount).div(oneRAY)
    );

    expect(await variableDebtStETH.balanceOf(user2.address)).to.be.gt(
      BigNumber.from(rebasingIndex).mul(borrowAmountBaseUnits).div(oneRAY)
    );
  });

  it("TC-ptoken-rebasing-04 Deposited aWETH should have balance multiplied by rebasing index", async () => {
    const {
      users: [user1],
      pool,
      aWETH,
      paWETH,
    } = testEnv;

    const userAETHAmount = await convertToCurrencyDecimals(
      aWETH.address,
      "10000"
    );

    await waitForTx(
      await aWETH.connect(user1.signer)["mint(uint256)"](userAETHAmount)
    );

    await aWETH.setIncomeIndex(rebasingIndex);

    await waitForTx(
      await aWETH.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await pool
        .connect(user1.signer)
        .supply(aWETH.address, userAETHAmount, user1.address, "0", {
          gasLimit: 12_450_000,
        })
    );

    expect(await paWETH.scaledBalanceOf(user1.address)).to.be.eq(
      BigNumber.from(rebasingIndex).mul(userAETHAmount).div(oneRAY)
    );
  });

  it("TC-ptoken-rebasing-05 aWETH borrower should have debt balance multiplied by rebasing index", async () => {
    const {
      users: [user2],
      pool,
      aWETH,
      variableDebtAWeth,
    } = testEnv;

    await waitForTx(
      await pool
        .connect(user2.signer)
        .borrow(aWETH.address, borrowAmountBaseUnits, "0", user2.address, {
          gasLimit: 12_450_000,
        })
    );

    expect(await variableDebtAWeth.balanceOf(user2.address)).to.be.eq(
      BigNumber.from(rebasingIndex).mul(borrowAmountBaseUnits).div(oneRAY)
    );

    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    expect(await variableDebtAWeth.balanceOf(user2.address)).to.be.gt(
      BigNumber.from(rebasingIndex).mul(borrowAmountBaseUnits).div(oneRAY)
    );
  });
});
