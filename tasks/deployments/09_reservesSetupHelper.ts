import {task} from "hardhat/config";
import {step_09} from "../../deploy/tasks/deployments/testnet/steps/09_reservesSetupHelper";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:reserves-setup-helper", "Deploy reserves setup helper")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_09(verify)
  })
