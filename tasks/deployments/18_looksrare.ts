import {task} from "hardhat/config";
import {step_17} from "../../deploy/tasks/deployments/testnet/steps/17_looksrare";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:looksrare", "Deploy looksrare")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_17(verify)
  })
