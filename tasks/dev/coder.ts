import {decodeMulti} from "ethers-multisend";
import {task} from "hardhat/config";

task("decode", "Decode input data")
  .addPositionalParam("data", "hex encoded data")
  .setAction(async ({data}, DRE) => {
    await DRE.run("set-DRE");
    const {decodeInputData} = await import("../../helpers/contracts-helpers");
    decodeInputData(data);
  });

task("decode-multi", "Decode multi inputs data")
  .addPositionalParam("data", "hex encoded data")
  .setAction(async ({data}, DRE) => {
    await DRE.run("set-DRE");
    const {decodeInputData} = await import("../../helpers/contracts-helpers");
    decodeMulti(data).forEach((x) => {
      decodeInputData(x.data);
      console.log();
    });
  });
