import {task} from "hardhat/config";
import {step_16} from "../../deploy/tasks/deployments/testnet/steps/16_seaport";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:seaport", "Deploy seaport")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_16(verify)
  })
