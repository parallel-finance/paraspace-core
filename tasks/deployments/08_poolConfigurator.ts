import {task} from "hardhat/config";
import {step_08} from "../../deploy/tasks/deployments/testnet/steps/08_poolConfigurator";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:pool-configurator", "Deploy pool configurator")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_08(verify)
  })
