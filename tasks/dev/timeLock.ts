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
    console.log("action:", action);
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
    console.log("action:", action);
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
    console.log("action:", action);
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
