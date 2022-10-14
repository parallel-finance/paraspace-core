import {task} from "hardhat/config";
import {step_07} from "../../deploy/tasks/deployments/testnet/steps/07_pool";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:pool", "Deploy pool components")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_07(verify)
  })
