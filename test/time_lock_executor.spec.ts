import {expect} from "chai";
import {TestEnv} from "./helpers/make-suite";
import {
  advanceTimeAndBlock,
  evmRevert,
  evmSnapshot,
  timeLatest,
  waitForTx,
} from "../helpers/misc-utils";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {getACLManager} from "../helpers/contracts-getters";
import {ZERO_ADDRESS} from "../helpers/constants";
import {deployTimeLockExecutor} from "../helpers/contracts-deployments";
import {ProtocolErrors} from "../helpers/types";

describe("ExecutorWithTimelock Test", () => {
  let testEnv: TestEnv;
  let timeLock;
  let dropReserveEncodedData;
  let dropReserveSelector;
  let executionTimeStamp;
  before(async () => {
    testEnv = await loadFixture(testEnvFixture);

    const {users, weth, configurator} = testEnv;

    const aclManager = await getACLManager();

    timeLock = await deployTimeLockExecutor([
      aclManager.address,
      "100",
      "100",
      "10",
      "1000",
    ]);

    expect(await aclManager.isPoolAdmin(timeLock.address)).to.be.eq(false);

    await waitForTx(
      await aclManager.connect(users[3].signer).addPoolAdmin(timeLock.address)
    );
    expect(await aclManager.isPoolAdmin(timeLock.address)).to.be.eq(true);

    await waitForTx(
      await aclManager
        .connect(users[3].signer)
        .addActionProposeAdmin(users[4].address)
    );
    await waitForTx(
      await aclManager
        .connect(users[3].signer)
        .addActionApproveAdmin(users[5].address)
    );

    dropReserveEncodedData = configurator.interface.encodeFunctionData(
      "dropReserve",
      [weth.address]
    );

    dropReserveSelector = configurator.interface.getSighash(
      "dropReserve(address)"
    );

    executionTimeStamp = (await timeLatest()).add(110).toString();
  });

  it("queueTransaction fails when user is not action propose admin", async () => {
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
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_ACTION_PROPOSE_ADMIN);
  });

  it("queueTransaction fails when execution time wrong", async () => {
    const {users, configurator} = testEnv;

    const executionTimeStamp1 = (await timeLatest()).add(10).toString();
    await expect(
      timeLock
        .connect(users[4].signer)
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

  it("approveTransaction fails when action is not queued", async () => {
    const {users, configurator} = testEnv;

    await expect(
      timeLock
        .connect(users[5].signer)
        .approveTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp,
          false
        )
    ).to.be.revertedWith("ACTION_NOT_QUEUED");
  });

  it("executeTransaction fails when action is not queued", async () => {
    const {users, configurator} = testEnv;

    const executionTimeStamp2 = (await timeLatest()).sub(50).toString();
    await expect(
      timeLock
        .connect(users[4].signer)
        .executeTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp2,
          false
        )
    ).to.be.revertedWith("ACTION_NOT_QUEUED");
  });

  it("cancelTransaction fails when caller is not propose or approve admin", async () => {
    const {users, configurator} = testEnv;

    await expect(
      timeLock
        .connect(users[3].signer)
        .cancelTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp,
          false
        )
    ).to.be.revertedWith(
      ProtocolErrors.CALLER_NOT_ACTION_PROPOSE_OR_APPROVE_ADMIN
    );
  });

  it("cancelTransaction fails when action is not queued", async () => {
    const {users, configurator} = testEnv;

    await expect(
      timeLock
        .connect(users[4].signer)
        .cancelTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp,
          false
        )
    ).to.be.revertedWith("WRONG_ACTION_STATUS");
  });

  it("queueTransaction success", async () => {
    const {users, configurator} = testEnv;

    expect(
      await timeLock
        .connect(users[4].signer)
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

  it("cancelTransaction success by propose admin", async () => {
    const {users, configurator} = testEnv;
    const snapId = await evmSnapshot();

    expect(
      await timeLock
        .connect(users[4].signer)
        .cancelTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp,
          false
        )
    );

    await evmRevert(snapId);
  });

  it("cancelTransaction success by approve admin", async () => {
    const {users, configurator} = testEnv;
    const snapId = await evmSnapshot();

    expect(
      await timeLock
        .connect(users[5].signer)
        .cancelTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp,
          false
        )
    );

    await evmRevert(snapId);
  });

  it("executeTransaction fails when execution time not reach", async () => {
    const {users, configurator} = testEnv;

    await expect(
      timeLock
        .connect(users[4].signer)
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

  it("executeTransaction fails when grace period finished", async () => {
    const {users, configurator} = testEnv;

    const executionTimeStamp3 = (await timeLatest()).sub(120).toString();
    await expect(
      timeLock
        .connect(users[4].signer)
        .executeTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp3,
          false
        )
    ).to.be.revertedWith("GRACE_PERIOD_FINISHED");
  });

  it("setActionNeedApproval fails when user is not action approve admin", async () => {
    const {users, configurator} = testEnv;

    await expect(
      timeLock
        .connect(users[4].signer)
        .setActionNeedApproval(
          [configurator.address],
          [[dropReserveSelector]],
          [[true]]
        )
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_ACTION_APPROVE_ADMIN);
  });

  it("setActionNeedApproval success", async () => {
    const {users, configurator} = testEnv;

    expect(
      await timeLock
        .connect(users[5].signer)
        .setActionNeedApproval(
          [configurator.address],
          [[dropReserveSelector]],
          [[true]]
        )
    );
  });

  it("executeTransaction fails when action need approve", async () => {
    const {users, configurator} = testEnv;

    await advanceTimeAndBlock(110);
    await expect(
      timeLock
        .connect(users[4].signer)
        .executeTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp,
          false
        )
    ).to.be.revertedWith("ACTION_NOT_APPROVED");
  });

  it("approveTransaction fails when user is not action approve admin", async () => {
    const {users, configurator} = testEnv;

    await expect(
      timeLock
        .connect(users[4].signer)
        .approveTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp,
          false
        )
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_ACTION_APPROVE_ADMIN);
  });

  it("approveTransaction success", async () => {
    const {users, configurator} = testEnv;

    expect(
      await timeLock
        .connect(users[5].signer)
        .approveTransaction(
          configurator.address,
          0,
          "",
          dropReserveEncodedData,
          executionTimeStamp,
          false
        )
    );
  });

  it("executeTransaction success", async () => {
    const {users, configurator, pool, weth} = testEnv;

    let config = await pool.getReserveData(weth.address);
    expect(config.xTokenAddress).to.be.not.eq(ZERO_ADDRESS);

    expect(
      await timeLock
        .connect(users[4].signer)
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
