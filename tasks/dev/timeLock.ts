import {task} from "hardhat/config";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

task("next-execution-time", "Next valid execution time").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {getExecutionTime} = await import("../../helpers/contracts-helpers");
    const executionTime = await getExecutionTime();
    console.log("executionTime:", executionTime);
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
    const {getActionAndData, printEncodedData} = await import(
      "../../helpers/contracts-helpers"
    );
    const {getTimeLockExecutor} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    if (DRY_RUN) {
      await printEncodedData(target, data, executionTime);
    } else {
      const {action} = await getActionAndData(target, data, executionTime);
      await waitForTx(
        await timeLock.queueTransaction(...action, GLOBAL_OVERRIDES)
      );
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
    const {getActionAndData, printEncodedData} = await import(
      "../../helpers/contracts-helpers"
    );
    const {getTimeLockExecutor} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    if (DRY_RUN) {
      await printEncodedData(target, data, executionTime);
    } else {
      const {action} = await getActionAndData(target, data, executionTime);
      await waitForTx(
        await timeLock.executeTransaction(...action, GLOBAL_OVERRIDES)
      );
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
    const {getActionAndData, printEncodedData} = await import(
      "../../helpers/contracts-helpers"
    );
    const {getTimeLockExecutor} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    if (DRY_RUN) {
      await printEncodedData(target, data, executionTime);
    } else {
      const {action} = await getActionAndData(target, data, executionTime);
      await waitForTx(
        await timeLock.cancelTransaction(...action, GLOBAL_OVERRIDES)
      );
    }
  });
