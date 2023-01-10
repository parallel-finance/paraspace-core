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

task("list-queued-txs", "List queued transactions").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {getCurrentTime} = await import("../../helpers/contracts-helpers");
    const {getTimeLockExecutor} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    const time = await getCurrentTime();
    const gracePeriod = await timeLock.GRACE_PERIOD();
    const filter = timeLock.filters.QueuedAction();
    const events = await timeLock.queryFilter(filter);
    for (const e of events) {
      if (!(await timeLock.isActionQueued(e.args.actionHash))) {
        continue;
      }

      console.log(e.transactionHash);
      console.log(" actionHash:", e.args.actionHash);
      console.log(" target:", e.args.target);
      console.log(" data:", e.args.data);
      console.log(" executionTime:", e.args.executionTime.toString());
      console.log(
        " executionTime(mins):",
        e.args.executionTime.lte(time)
          ? 0
          : e.args.executionTime.sub(time).div(60).toString()
      );
      const expireTime = e.args.executionTime.add(gracePeriod);
      console.log(" expireTime:", expireTime.toString());
      console.log(
        " expireTime(mins):",
        expireTime.lte(time) ? 0 : expireTime.sub(time).div(60).toString()
      );
      console.log();
    }
  }
);
