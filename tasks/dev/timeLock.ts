import {BigNumber} from "ethers";
import {task} from "hardhat/config";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";
import InputDataDecoder from "ethereum-input-data-decoder";

const getAbi = async () => {
  const {
    ACLManager__factory,
    ExecutorWithTimelock__factory,
    ParaSpaceOracle__factory,
    PoolAddressesProvider__factory,
    PoolConfigurator__factory,
    ReservesSetupHelper__factory,
  } = await import("../../types");

  return [
    ...ReservesSetupHelper__factory.abi,
    ...ExecutorWithTimelock__factory.abi,
    ...PoolAddressesProvider__factory.abi,
    ...PoolConfigurator__factory.abi,
    ...ParaSpaceOracle__factory.abi,
    ...ACLManager__factory.abi,
  ];
};

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
    const delay = await timeLock.getDelay();
    const filter = timeLock.filters.QueuedAction();
    const events = await timeLock.queryFilter(filter);
    for (const e of events) {
      if (!(await timeLock.isActionQueued(e.args.actionHash))) {
        continue;
      }

      const executeTime = e.args.executionTime.add(delay);
      const expireTime = e.args.executionTime.add(gracePeriod);
      console.log(e.transactionHash);
      console.log(" actionHash:", e.args.actionHash);
      console.log(" target:", e.args.target);
      console.log(" data:", e.args.data);
      console.log(" executionTime:", e.args.executionTime.toString());
      console.log(" executeTime:", executeTime.toString());
      console.log(
        " executeTime(mins):",
        executeTime.lte(time) ? 0 : executeTime.sub(time).div(60).toString()
      );
      console.log(" expireTime:", expireTime.toString());
      console.log(
        " expireTime(mins):",
        expireTime.lte(time) ? 0 : expireTime.sub(time).div(60).toString()
      );
      console.log();
    }
  }
);

task("decode-queued-txs", "Decode queued transactions").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {getTimeLockExecutor} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    const decoder = new InputDataDecoder(await getAbi());
    const filter = timeLock.filters.QueuedAction();
    const events = await timeLock.queryFilter(filter);
    for (const e of events) {
      if (!(await timeLock.isActionQueued(e.args.actionHash))) {
        continue;
      }
      const inputData = decoder.decodeData(e.args.data.toString());
      const normalized = JSON.stringify(inputData, (k, v) => {
        return v.type === "BigNumber" ? +v.hex.toString(10) : v;
      });

      console.log(JSON.stringify(JSON.parse(normalized), null, 4));
      console.log();
    }
  }
);

task("decode-buffered-txs", "Decode buffered transactions").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {getTimeLockDataInDb} = await import(
      "../../helpers/contracts-helpers"
    );
    const decoder = new InputDataDecoder(await getAbi());
    const actions = await getTimeLockDataInDb();

    for (const a of actions) {
      const [, , , data] = a.action;
      const inputData = decoder.decodeData(data.toString());
      const normalized = JSON.stringify(inputData, (k, v) => {
        return v.type === "BigNumber" ? +v.hex.toString(10) : v;
      });

      console.log(JSON.stringify(JSON.parse(normalized), null, 4));
      console.log();
    }
  }
);

task("list-buffered-txs", "List buffered transactions").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {getCurrentTime, getTimeLockDataInDb} = await import(
      "../../helpers/contracts-helpers"
    );
    const {getTimeLockExecutor} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    const time = await getCurrentTime();
    const gracePeriod = await timeLock.GRACE_PERIOD();
    const delay = await timeLock.getDelay();
    const actions = await getTimeLockDataInDb();

    for (const a of actions) {
      const [target, , , data, executionTime] = a.action;
      const executeTime = BigNumber.from(executionTime).add(delay);
      const expireTime = BigNumber.from(executionTime).add(gracePeriod);
      console.log(a.actionHash);
      console.log(" target:", target);
      console.log(" data:", data);
      console.log(" executionTime:", executionTime);
      console.log(
        " executionTime(mins):",
        executeTime.lte(time) ? 0 : executeTime.sub(time).div(60).toString()
      );
      console.log(" expireTime:", expireTime.toString());
      console.log(
        " expireTime(mins):",
        expireTime.lte(time) ? 0 : expireTime.sub(time).div(60).toString()
      );
      console.log();
    }
  }
);

task("queue-buffered-txs", "Queue buffered transactions").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {getTimeLockDataInDb} = await import(
      "../../helpers/contracts-helpers"
    );
    const {getTimeLockExecutor} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    const actions = await getTimeLockDataInDb();

    for (const a of actions) {
      console.log(a.actionHash);
      await waitForTx(
        await timeLock.queueTransaction(...a.action, GLOBAL_OVERRIDES)
      );
    }
  }
);

task("execute-buffered-txs", "Execute buffered transactions").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {getTimeLockDataInDb} = await import(
      "../../helpers/contracts-helpers"
    );
    const {getTimeLockExecutor} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    const actions = await getTimeLockDataInDb();

    for (const a of actions) {
      console.log(a.actionHash);
      await waitForTx(
        await timeLock.executeTransaction(...a.action, GLOBAL_OVERRIDES)
      );
    }
  }
);

task("cancel-buffered-txs", "Cancel buffered transactions").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {getTimeLockDataInDb} = await import(
      "../../helpers/contracts-helpers"
    );
    const {getTimeLockExecutor} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    const actions = await getTimeLockDataInDb();

    for (const a of actions) {
      console.log(a.actionHash);
      await waitForTx(
        await timeLock.cancelTransaction(...a.action, GLOBAL_OVERRIDES)
      );
    }
  }
);
