import {task} from "hardhat/config";
import {step_12} from "../../deploy/tasks/deployments/testnet/steps/12_uiIncentiveDataProvider";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:ui-incentive-data-provider", "Deploy UI incentive data provider")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_12(verify)
  })
