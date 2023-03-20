import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {deployDefaultTimeLockStrategy} from "../helpers/contracts-deployments";
import {
  getPoolConfiguratorProxy,
  getTimeLockProxy,
} from "../helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {advanceTimeAndBlock} from "../helpers/misc-utils";
import {testEnvFixture} from "./helpers/setup-env";
import {supplyAndValidate} from "./helpers/validated-steps";

describe("TimeLock functionality tests", () => {
  const minTime = 5;
  const midTime = 300;
  const maxTime = 3600;

  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      dai,
      usdc,
      users: [user1, user2],
      pool,
      poolAdmin,
    } = testEnv;

    // User 1 - Deposit dai
    await supplyAndValidate(dai, "200000", user1, true);
    // User 2 - Deposit usdc
    await supplyAndValidate(usdc, "200000", user2, true);
    const minThreshold = await convertToCurrencyDecimals(usdc.address, "1000");
    const midThreshold = await convertToCurrencyDecimals(usdc.address, "10000");

    const defaultStrategy = await deployDefaultTimeLockStrategy(
      pool.address,
      minThreshold.toString(),
      midThreshold.toString(),
      minTime.toString(),
      midTime.toString(),
      maxTime.toString(),
      midThreshold.mul(10).toString(),
      (12 * 3600).toString(),
      (24 * 3600).toString()
    );

    const poolConfigurator = await getPoolConfiguratorProxy();
    await poolConfigurator
      .connect(poolAdmin.signer)
      .setReserveTimeLockStrategyAddress(usdc.address, defaultStrategy.address);

    return testEnv;
  };

  it("borrowed amount below minThreshold should be timeBlocked for 1 block only", async () => {
    const {
      pool,
      users: [user1],
      usdc,
    } = await loadFixture(fixture);

    const amount = await convertToCurrencyDecimals(usdc.address, "100");
    //FIXME(alan): may we have a error code for this.

    await pool
      .connect(user1.signer)
      .borrow(usdc.address, amount, "0", user1.address, {
        gasLimit: 5000000,
      });

    await expect(await usdc.balanceOf(pool.TIME_LOCK())).to.be.eq(amount);

    const timeLockProxy = await getTimeLockProxy();
    const balanceBefore = await usdc.balanceOf(user1.address);

    await advanceTimeAndBlock(10);

    await timeLockProxy.connect(user1.signer).claim("0");

    const balanceAfter = await usdc.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(amount));
  });
});
