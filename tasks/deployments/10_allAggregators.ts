import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../deploy/helpers/hardhat-constants";

task("deploy:all-aggregators", "Deploy all aggregators").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_10} = await import(
      "../../deploy/tasks/deployments/full-deployment/steps/10_allAggregators"
    );
    await step_10(ETHERSCAN_VERIFICATION);
  }
);
