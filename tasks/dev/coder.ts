import {decodeMulti} from "ethers-multisend";
import {task} from "hardhat/config";

task("decode", "Decode input data")
  .addPositionalParam("data", "hex encoded data")
  .setAction(async ({data}, DRE) => {
    await DRE.run("set-DRE");
    const {decodeInputData} = await import("../../helpers/contracts-helpers");
    console.log(JSON.stringify(decodeInputData(data), null, 4));
  });

task("decode-multi", "Decode multi inputs data")
  .addPositionalParam("data", "hex encoded data")
  .setAction(async ({data}, DRE) => {
    await DRE.run("set-DRE");
    const {decodeInputData} = await import("../../helpers/contracts-helpers");
    decodeMulti(data).forEach((x) => {
      console.log(x.to);
      console.log(JSON.stringify(decodeInputData(x.data), null, 4));
      console.log();
    });
  });

task("decode-tx", "Decode transaction")
  .addPositionalParam("txHash", "transaction hash")
  .setAction(async ({txHash}, DRE) => {
    await DRE.run("set-DRE");
    const tx = await DRE.ethers.provider.getTransaction(txHash);
    const txReceipt = await DRE.ethers.provider.getTransactionReceipt(txHash);
    console.log(tx);
    console.log(txReceipt);
    const {decodeInputData} = await import("../../helpers/contracts-helpers");
    const decoded = decodeInputData(tx.data);
    console.log(JSON.stringify(decoded, null, 4));
  });
