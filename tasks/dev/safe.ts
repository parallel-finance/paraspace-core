import {task} from "hardhat/config";
import {
  FORK,
  MULTI_SEND,
  MULTI_SIG,
  TIME_LOCK_DEFAULT_OPERATION,
} from "../../helpers/hardhat-constants";
import {ethers} from "ethers";
import {decodeMulti} from "ethers-multisend";
import EthersAdapter from "@safe-global/safe-ethers-lib";
import SafeServiceClient from "@safe-global/safe-service-client";
import {findLastIndex} from "lodash";
import {TimeLockOperation} from "../../helpers/types";

const TIME_LOCK_SIGS = {
  "0xc1a287e2": "GRACE_PERIOD()",
  "0x7d645fab": "MAXIMUM_DELAY()",
  "0xb1b43ae5": "MINIMUM_DELAY()",
  "0x0e18b681": "acceptAdmin()",
  "0x1dc40b51": "cancelTransaction(address,uint256,string,bytes,uint256,bool)",
  "0x8902ab65": "executeTransaction(address,uint256,string,bytes,uint256,bool)",
  "0x6e9960c3": "getAdmin()",
  "0xcebc9a82": "getDelay()",
  "0xd0468156": "getPendingAdmin()",
  "0xb1fc8796": "isActionQueued(bytes32)",
  "0x8d8fe2e3": "queueTransaction(address,uint256,string,bytes,uint256,bool)",
  "0xe177246e": "setDelay(uint256)",
  "0x4dd18bf5": "setPendingAdmin(address)",
};

task("decode-safe-txs", "Decode safe txs").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {getFirstSigner, getTimeLockExecutor} = await import(
    "../../helpers/contracts-getters"
  );
  const {decodeInputData} = await import("../../helpers/contracts-helpers");
  const timeLock = await getTimeLockExecutor();
  const signer = await getFirstSigner();
  const ethAdapter = new EthersAdapter({
    ethers,
    signerOrProvider: signer,
  });

  const safeService = new SafeServiceClient({
    txServiceUrl: `https://safe-transaction-${
      FORK || DRE.network.name
    }.safe.global`,
    ethAdapter,
  });
  const res = (
    await safeService.getPendingTransactions(MULTI_SIG)
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
        cur.to === MULTI_SEND
          ? decodeMulti(cur.data).map((x) => ({to: x.to, data: x.data}))
          : [{to: cur.to, data: cur.data}]
      ).map(({to, data}) => {
        if (to != timeLock.address) {
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
    console.log();
    console.log(to);
    await decodeInputData(data);
  }
});

task("propose-safe-txs", "Propose buffered timelock transactions").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {getTimeLockDataInDb, proposeSafeTransaction} = await import(
      "../../helpers/contracts-helpers"
    );
    const {getTimeLockExecutor} = await import(
      "../../helpers/contracts-getters"
    );
    const timeLock = await getTimeLockExecutor();
    const actions = await getTimeLockDataInDb();

    for (const a of actions) {
      console.log(a.actionHash);
      if (TIME_LOCK_DEFAULT_OPERATION === TimeLockOperation.Cancel) {
        await proposeSafeTransaction(timeLock.address, a.cancelData);
      } else if (TIME_LOCK_DEFAULT_OPERATION === TimeLockOperation.Execute) {
        await proposeSafeTransaction(timeLock.address, a.executeData);
      } else {
        await proposeSafeTransaction(timeLock.address, a.queueData);
      }
    }
  }
);
