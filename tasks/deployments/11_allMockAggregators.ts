import {task} from "hardhat/config";
import {step_11} from "../../deploy/tasks/deployments/testnet/steps/11_allMockAggregators";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:all-mock-aggregators", "Deploy all mock aggregators and reserves")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_11(verify)
  })
