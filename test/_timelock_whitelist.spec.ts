import {expect} from "chai";
import {BigNumber} from "ethers";
import {timeLatest, waitForTx} from "../helpers/misc-utils";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {deployReserveTimeLockStrategy} from "../helpers/contracts-deployments";
import {testEnvFixture} from "./helpers/setup-env";
import {TestEnv} from "./helpers/make-suite";
import {DefaultTimeLockStrategy} from "../types";
import {eContractid} from "../helpers/types";
import {supplyAndValidate} from "./helpers/validated-steps";
import {almostEqual} from "./helpers/uniswapv3-helper";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {getInitializableAdminUpgradeabilityProxy} from "../helpers/contracts-getters";
import {ONE_ADDRESS} from "../helpers/constants";

describe("timeLock whiteList tests", function () {
  let defaultTimeLockStrategy: DefaultTimeLockStrategy;
  let testEnv: TestEnv;

  const minThreshold = BigNumber.from(10);
  const midThreshold = BigNumber.from(20);
  const minWaitTime = 100;
  const midWaitTime = 2000;
  const maxWaitTime = 36000;
  const maxPoolPeriodRate = BigNumber.from(400);
  const maxPoolPeriodWaitTime = 40;
  const period = 86400;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      configurator,
      pool,
      usdc,
      users: [user1, user2],
    } = testEnv;

    defaultTimeLockStrategy = await deployReserveTimeLockStrategy(
      eContractid.DefaultTimeLockStrategy,
      pool.address,
      minThreshold.toString(),
      midThreshold.toString(),
      minWaitTime.toString(),
      midWaitTime.toString(),
      maxWaitTime.toString(),
      maxPoolPeriodRate.toString(),
      maxPoolPeriodWaitTime.toString(),
      period.toString()
    );

    await supplyAndValidate(usdc, "10000", user1, true);
    await supplyAndValidate(usdc, "10000", user2, true);

    await waitForTx(
      await configurator.setReserveTimeLockStrategyAddress(
        usdc.address,
        defaultTimeLockStrategy.address
      )
    );

    return testEnv;
  };

  it("normal non-whitelisted user should still have long wait time", async function () {
    const {
      pool,
      users: [user1],
      usdc,
      timeLock,
    } = await loadFixture(fixture);
    const currentTime = (await timeLatest()).toNumber();
    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(
          usdc.address,
          await convertToCurrencyDecimals(usdc.address, "1000"),
          0,
          user1.address
        )
    );
    await expect(
      (await timeLock.getAgreement(0)).releaseTime - currentTime
    ).to.gte(minWaitTime);
  });

  it("whitelisted user should only have 12s of wait time", async function () {
    const {
      pool,
      users: [user1],
      usdc,
      timeLock,
      poolAdmin,
    } = await loadFixture(fixture);
    await waitForTx(
      await (await getInitializableAdminUpgradeabilityProxy(timeLock.address))
        .connect(poolAdmin.signer)
        .changeAdmin(ONE_ADDRESS)
    );
    await waitForTx(
      await timeLock
        .connect(poolAdmin.signer)
        .updateTimeLockWhiteList([user1.address], [])
    );
    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdraw(
          usdc.address,
          await convertToCurrencyDecimals(usdc.address, "1000"),
          user1.address
        )
    );
    const currentTime = (await timeLatest()).toNumber();
    await almostEqual(
      (await timeLock.getAgreement(0)).releaseTime - currentTime,
      12
    );
  });
});
