import {task} from "hardhat/config";
import {step_14} from "../../deploy/tasks/deployments/testnet/steps/14_punkGateway";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:punk-gateway", "Deploy punk gateway")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_14(verify)
  })
