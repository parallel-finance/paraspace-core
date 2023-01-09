import {task} from "hardhat/config";
import {
  getActionAndHash,
  getExecutionTime,
} from "../../helpers/contracts-helpers";
import {DRY_RUN} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

task("next-execution-time", "Next valid execution time").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {getTimeLockExecutor} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    const executionTime = await getExecutionTime(timeLock);
    // add 600s for building safe tx
    console.log("executionTime:", executionTime.add(600).toString());
  }
);

task("queue-tx", "Queue transaction to be executed later")
  .addPositionalParam("target", "target contract address to interact with")
  .addPositionalParam("data", "hex encoded data")
  .addPositionalParam(
    "executionTime",
    "time at which to execute the transaction"
  )
  .setAction(async ({target, data, executionTime}, DRE) => {
    await DRE.run("set-DRE");
    const {isNotFalsyOrZeroAddress} = await import(
      "../../helpers/contracts-helpers"
    );
    if (!isNotFalsyOrZeroAddress(target)) {
      return;
    }
    const {getTimeLockExecutor} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    const [action, actionHash] = await getActionAndHash(
      target,
      data,
      executionTime
    );
    console.log("isActionQueued:", await timeLock.isActionQueued(actionHash));
    if (DRY_RUN) {
      const encodedData = timeLock.interface.encodeFunctionData(
        "queueTransaction",
        action
      );
      console.log(`hex: ${encodedData}`);
    } else {
      await waitForTx(await timeLock.queueTransaction(...action));
    }
  });

task("execute-tx", "Execute transaction which has been queued earlier")
  .addPositionalParam("target", "target contract address to interact with")
  .addPositionalParam("data", "hex encoded data")
  .addPositionalParam(
    "executionTime",
    "time at which to execute the transaction"
  )
  .setAction(async ({data, target, executionTime}, DRE) => {
    await DRE.run("set-DRE");
    const {isNotFalsyOrZeroAddress} = await import(
      "../../helpers/contracts-helpers"
    );
    if (!isNotFalsyOrZeroAddress(target)) {
      return;
    }
    const {getTimeLockExecutor} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    const [action, actionHash] = await getActionAndHash(
      target,
      data,
      executionTime
    );
    console.log("isActionQueued:", await timeLock.isActionQueued(actionHash));
    if (DRY_RUN) {
      const encodedData = timeLock.interface.encodeFunctionData(
        "executeTransaction",
        action
      );
      console.log(`hex: ${encodedData}`);
    } else {
      await waitForTx(await timeLock.executeTransaction(...action));
    }
  });

task("cancel-tx", "Cancel queued transaction")
  .addPositionalParam("target", "target contract address to interact with")
  .addPositionalParam("data", "hex encoded data")
  .addPositionalParam(
    "executionTime",
    "time at which to execute the transaction"
  )
  .setAction(async ({data, target, executionTime}, DRE) => {
    await DRE.run("set-DRE");
    const {isNotFalsyOrZeroAddress} = await import(
      "../../helpers/contracts-helpers"
    );
    if (!isNotFalsyOrZeroAddress(target)) {
      return;
    }
    const {getTimeLockExecutor} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    const [action, actionHash] = await getActionAndHash(
      target,
      data,
      executionTime
    );
    console.log("isActionQueued:", await timeLock.isActionQueued(actionHash));
    if (DRY_RUN) {
      const encodedData = timeLock.interface.encodeFunctionData(
        "cancelTransaction",
        action
      );
      console.log(`hex: ${encodedData}`);
    } else {
      await waitForTx(await timeLock.cancelTransaction(...action));
    }
  });
