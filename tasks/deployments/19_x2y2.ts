
import {task} from "hardhat/config";
import {step_19} from "../../deploy/tasks/deployments/testnet/steps/19_x2y2";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:x2y2", "Deploy x2y2")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_19(verify)
  })
