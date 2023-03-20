import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {parseEther} from "ethers/lib/utils";
import {utils} from "ethers";
import {MAX_UINT_AMOUNT, ONE_YEAR, MAX_BORROW_CAP} from "../helpers/constants";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {ProtocolErrors} from "../helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {supplyAndValidate} from "./helpers/validated-steps";
import {deployDefaultTimeLockStrategy} from "../helpers/contracts-deployments";
import {getPoolConfiguratorProxy} from "../helpers/contracts-getters";

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
    } = testEnv;

    // User 1 - Deposit dai
    await supplyAndValidate(dai, "200000", user1, true);
    // User 2 - Deposit usdc
    await supplyAndValidate(dai, "200000", user2, true);
    const minThreshold = await convertToCurrencyDecimals(usdc.address, "1000");
    const midThreshold = await convertToCurrencyDecimals(usdc.address, "10000");

    const defaultStrategy = await deployDefaultTimeLockStrategy(
      minThreshold.toString(),
      midThreshold.toString(),
      minTime.toString(),
      midTime.toString(),
      maxTime.toString()
    );

    const poolConfigurator = await getPoolConfiguratorProxy();
    poolConfigurator.setReserveTimeLockStrategyAddress(
      usdc.address,
      defaultStrategy
    );

    return testEnv;
  };

  it("Borrow below threshold ", async () => {
    const {
      pool,
      users: [user1],
      usdc,
    } = await loadFixture(fixture);

    // const amount = await convertToCurrencyDecimals(usdc.address, "100");
    // //FIXME(alan): may we have a error code for this.
    // await expect(
    //   pool
    //     .connect(user1.signer)
    //     .borrow(usdc.address, amount, "0", user1.address, {
    //       gasLimit: 5000000,
    //     })
    // ).to.be.reverted;
  });
});
