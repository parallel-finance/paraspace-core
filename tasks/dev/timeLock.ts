import {BigNumberish, BytesLike} from "ethers";
import {defaultAbiCoder, solidityKeccak256} from "ethers/lib/utils";
import {task} from "hardhat/config";
import {getTimeLockExecutor} from "../../helpers/contracts-getters";
import {isNotFalsyOrZeroAddress} from "../../helpers/contracts-helpers";
import {DRY_RUN} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";
import {PromiseOrValue} from "../../types/common";

type Action = [
  PromiseOrValue<string>,
  PromiseOrValue<BigNumberish>,
  PromiseOrValue<string>,
  PromiseOrValue<BytesLike>,
  PromiseOrValue<BigNumberish>,
  PromiseOrValue<boolean>
];

task("next-execution-time", "Next valid execution time").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const timeLock = await getTimeLockExecutor();
    const delay = await timeLock.getDelay();
    const blockNumber = await DRE.ethers.provider.getBlockNumber();
    const timestamp = (await DRE.ethers.provider.getBlock(blockNumber))
      .timestamp;
    // add 600s for building safe tx
    console.log("executionTime:", delay.add(timestamp).add(600).toString());
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
    if (!isNotFalsyOrZeroAddress(target)) {
      return;
    }
    const timeLock = await getTimeLockExecutor();
    console.log("target:", target);
    console.log("data:", data);
    console.log("executionTime:", executionTime);
    const action: Action = [target, 0, "", data, executionTime, false];
    console.log("action:", action.toString());
    const actionHash = solidityKeccak256(
      ["string"],
      [
        defaultAbiCoder.encode(
          ["address", "uint256", "string", "bytes", "uint256", "bool"],
          action
        ),
      ]
    );
    console.log("actionHash:", actionHash);
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
    if (!isNotFalsyOrZeroAddress(target)) {
      return;
    }
    const timeLock = await getTimeLockExecutor();
    console.log("target:", target);
    console.log("data:", data);
    console.log("executionTime:", executionTime);
    const action: Action = [target, 0, "", data, executionTime, false];
    console.log("action:", action.toString());
    const actionHash = solidityKeccak256(
      ["string"],
      [
        defaultAbiCoder.encode(
          ["address", "uint256", "string", "bytes", "uint256", "bool"],
          action
        ),
      ]
    );
    console.log("actionHash:", actionHash);
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
    if (!isNotFalsyOrZeroAddress(target)) {
      return;
    }
    const timeLock = await getTimeLockExecutor();
    console.log("target:", target);
    console.log("data:", data);
    console.log("executionTime:", executionTime);
    const action: Action = [target, 0, "", data, executionTime, false];
    console.log("action:", action.toString());
    const actionHash = solidityKeccak256(
      ["string"],
      [
        defaultAbiCoder.encode(
          ["address", "uint256", "string", "bytes", "uint256", "bool"],
          action
        ),
      ]
    );
    console.log("actionHash:", actionHash);
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
