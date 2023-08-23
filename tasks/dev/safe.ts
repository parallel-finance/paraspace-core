import {task} from "hardhat/config";
import {TIME_LOCK_SIGS} from "../../helpers/hardhat-constants";
import {decodeMulti, MetaTransaction} from "ethers-multisend";
import {findLastIndex} from "lodash";
import {eContractid} from "../../helpers/types";

task("decode-safe-txs", "Decode safe txs").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {getTimeLockExecutor, getSafeSdkAndService} = await import(
    "../../helpers/contracts-getters"
  );
  const {getContractAddressInDb} = await import(
    "../../helpers/contracts-helpers"
  );
  const {getParaSpaceConfig} = await import("../../helpers/misc-utils");
  const {decodeInputData} = await import("../../helpers/contracts-helpers");
  const timeLock = (await getContractAddressInDb(eContractid.TimeLockExecutor))
    ? await getTimeLockExecutor()
    : undefined;
  const paraSpaceConfig = getParaSpaceConfig();

  const {safeService} = await getSafeSdkAndService(
    paraSpaceConfig.Governance.Multisig
  );
  const res = (
    await safeService.getPendingTransactions(
      paraSpaceConfig.Governance.Multisig
    )
  ).results.sort((a, b) =>
    a.nonce > b.nonce
      ? 1
      : a.nonce === b.nonce &&
        new Date(a.submissionDate).valueOf() >
          new Date(b.submissionDate).valueOf()
      ? 1
      : -1
  );

  const txs = res
    .filter((x, i) => findLastIndex(res, (y) => y.nonce === x.nonce) === i)
    .reduce((ite, cur) => {
      if (!cur.data) {
        return ite;
      }

      const toConcatenate = (
        cur.to === paraSpaceConfig.Governance.Multisend
          ? decodeMulti(cur.data).map((x) => ({to: x.to, data: x.data}))
          : [{to: cur.to, data: cur.data}]
      ).map(({to, data}) => {
        if (to != timeLock?.address) {
          return {to, data};
        }

        const sig = TIME_LOCK_SIGS[data.slice(0, 10)];
        if (!sig) {
          return {to, data};
        }

        [to, , , data] = timeLock.interface.decodeFunctionData(sig, data);
        return {to, data};
      });

      ite = ite.concat(toConcatenate);

      return ite;
    }, [] as {to: string; data: string}[]);

  for (const tx of txs) {
    const {to, data} = tx;
    console.log(to);
    console.log(JSON.stringify(decodeInputData(data), null, 4));
    console.log();
  }
});

task(
  "propose-buffered-txs",
  "Propose buffered timelock transactions"
).setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {getTimeLockDataInDb, getTimeLockData, proposeMultiSafeTransactions} =
    await import("../../helpers/contracts-helpers");
  const actions = await getTimeLockDataInDb();
  const transactions: MetaTransaction[] = [];

  for (const a of actions) {
    console.log(a.actionHash);
    const [target, , , data, executionTime] = a.action;
    const {newTarget, newData} = await getTimeLockData(
      target.toString(),
      data.toString(),
      executionTime.toString()
    );
    transactions.push({
      to: newTarget,
      value: "0",
      data: newData,
    });
  }

  await proposeMultiSafeTransactions(transactions);
});

task("propose-queued-txs", "Propose queued timelock transactions").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {getTimeLockData, proposeMultiSafeTransactions, getCurrentTime} =
      await import("../../helpers/contracts-helpers");
    const {getTimeLockExecutor} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    const time = await getCurrentTime();
    const delay = await timeLock.getDelay();
    const gracePeriod = await timeLock.GRACE_PERIOD();
    const filter = timeLock.filters.QueuedAction();
    const events = await timeLock.queryFilter(filter);

    const transactions: MetaTransaction[] = [];
    for (const e of events) {
      if (!(await timeLock.isActionQueued(e.args.actionHash))) {
        continue;
      }

      const executeTime = e.args.executionTime.add(delay);
      const expireTime = e.args.executionTime.add(gracePeriod);

      if (time.lt(executeTime) || time.gt(expireTime)) {
        continue;
      }

      const {newTarget, newData} = await getTimeLockData(
        e.args.target.toString(),
        e.args.data.toString(),
        e.args.executionTime.toString()
      );
      transactions.push({
        to: newTarget,
        value: "0",
        data: newData,
      });
    }

    await proposeMultiSafeTransactions(transactions);
  }
);
