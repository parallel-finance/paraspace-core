import {expect} from "chai";
import {TestEnv} from "./helpers/make-suite";
import {
  advanceTimeAndBlock,
  timeLatest,
  waitForTx,
} from "../helpers/misc-utils";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {getACLManager} from "../helpers/contracts-getters";
import {ZERO_ADDRESS} from "../helpers/constants";
import {deployTimeLockExecutor} from "../helpers/contracts-deployments";

describe("ExecutorWithTimelock Test", () => {
  let testEnv: TestEnv;
  let timeLock;
  let dropReserveEncodedData;
  let executionTimeStamp;
  before(async () => {
    testEnv = await loadFixture(testEnvFixture);

    const {users, weth, configurator} = testEnv;

    timeLock = await deployTimeLockExecutor([
      users[0].address,
      "100",
      "100",
      "10",
      "1000",
    ]);

    const aclManager = await getACLManager();

    expect(await aclManager.isPoolAdmin(timeLock.address)).to.be.eq(false);

    await waitForTx(
      await aclManager.connect(users[3].signer).addPoolAdmin(timeLock.address)
    );
    expect(await aclManager.isPoolAdmin(timeLock.address)).to.be.eq(true);

    dropReserveEncodedData = configurator.interface.encodeFunctionData(
      "dropReserve",
      [weth.address]
    );

    executionTimeStamp = (await timeLatest()).add(110).toString();
  });

  it("queueTransaction fails when user is not the owner", async () => {
    const {users, configurator} = testEnv;

    await expect(
      timeLock
        .connect(users[1].signer)
        .queueTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp,
          false
        )
    ).to.be.revertedWith("ONLY_BY_ADMIN");
  });

  it("queueTransaction fails when execution time wrong", async () => {
    const {
      users: [user1],
      configurator,
    } = testEnv;

    const executionTimeStamp1 = (await timeLatest()).add(10).toString();
    await expect(
      timeLock
        .connect(user1.signer)
        .queueTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp1,
          false
        )
    ).to.be.revertedWith("EXECUTION_TIME_UNDERESTIMATED");
  });

  it("executeTransaction fails when action is not queued", async () => {
    const {
      users: [user1],
      configurator,
    } = testEnv;

    await expect(
      timeLock
        .connect(user1.signer)
        .executeTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp,
          false
        )
    ).to.be.revertedWith("ACTION_NOT_QUEUED");
  });

  it("queueTransaction success", async () => {
    const {
      users: [user1],
      configurator,
    } = testEnv;

    expect(
      await timeLock
        .connect(user1.signer)
        .queueTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp,
          false
        )
    );
  });

  it("executeTransaction fails when execution time not reach", async () => {
    const {
      users: [user1],
      configurator,
    } = testEnv;

    await expect(
      timeLock
        .connect(user1.signer)
        .executeTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp,
          false
        )
    ).to.be.revertedWith("TIMELOCK_NOT_FINISHED");
  });

  it("executeTransaction success", async () => {
    const {
      users: [user1],
      configurator,
      pool,
      weth,
    } = testEnv;

    let config = await pool.getReserveData(weth.address);
    expect(config.xTokenAddress).to.be.not.eq(ZERO_ADDRESS);
    await advanceTimeAndBlock(110);

    expect(
      await timeLock
        .connect(user1.signer)
        .executeTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp,
          false
        )
    );

    config = await pool.getReserveData(weth.address);
    expect(config.xTokenAddress).to.be.eq(ZERO_ADDRESS);
  });
});
