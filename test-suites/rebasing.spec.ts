import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {MAX_UINT_AMOUNT, ONE_YEAR} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {advanceTimeAndBlock, waitForTx} from "../deploy/helpers/misc-utils";
import {MOCK_CHAINLINK_AGGREGATORS_PRICES} from "../deploy/market-config";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

describe("Rebasing tokens", () => {
  BigNumber.from(MOCK_CHAINLINK_AGGREGATORS_PRICES.BAYC);
  let testEnv: TestEnv;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
  });

  it("should be able to supply stETH and mint rebasing PToken", async () => {
    const {
      users: [user1],
      pool,
      stETH,
    } = testEnv;

    const userStETHAmount = await convertToCurrencyDecimals(
      stETH.address,
      "10000"
    );

    await waitForTx(
      await stETH.connect(user1.signer)["mint(uint256)"](userStETHAmount)
    );

    await stETH.setPooledEthBaseShares("1080000000000000000000000000");

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
  });

  it("expect the scaled balance to be the principal balance multiplied by Lido pool shares divided by RAY (2^27)", async () => {
    const {
      users: [user1],
      stETH,
      pstETH,
    } = testEnv;

    const userStETHAmount = await convertToCurrencyDecimals(
      stETH.address,
      "10000"
    );

    expect(await pstETH.scaledBalanceOf(user1.address)).to.be.eq(
      BigNumber.from("1080000000000000000000000000")
        .mul(userStETHAmount)
        .div("1000000000000000000000000000")
    );
  });

  it("expect the balance of supplier to accrue both stETH and pstETH interest", async () => {
    const {
      users: [user1, user2],
      pool,
      stETH,
      pstETH,
      weth,
    } = testEnv;

    const supplyAmountBaseUnits = await convertToCurrencyDecimals(
      weth.address,
      "80000"
    );
    const userStETHAmount = await convertToCurrencyDecimals(
      stETH.address,
      "10000"
    );
    const borrowAmountBaseUnits = await convertToCurrencyDecimals(
      stETH.address,
      "1"
    );

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

    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    expect(await pstETH.balanceOf(user1.address)).to.be.gt(
      BigNumber.from("1080000000000000000000000000")
        .mul(userStETHAmount)
        .div("1000000000000000000000000000")
    );
  });

  it("deposited aWETH should have balance multiplied by rebasing index", async () => {
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

    await aWETH.setIncomeIndex("1080000000000000000000000000");

    it("should be able to supply aWETH and mint rebasing PToken", async () => {
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
    });

    it("expect the scaled balance to be the principal balance multiplied by Aave pool liquidity index divided by RAY (2^27)", async () => {
      expect(await paWETH.scaledBalanceOf(user1.address)).to.be.eq(
        BigNumber.from("1080000000000000000000000000")
          .mul(userAETHAmount)
          .div("1000000000000000000000000000")
      );
    });
  });
});
