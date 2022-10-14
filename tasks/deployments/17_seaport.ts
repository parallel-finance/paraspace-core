import {task} from "hardhat/config";
import {step_17} from "../../deploy/tasks/deployments/testnet/steps/17_seaport";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:seaport", "Deploy seaport")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_17(verify)
  })
