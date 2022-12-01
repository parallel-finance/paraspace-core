import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../deploy/helpers/hardhat-constants";

task("deploy:renounce-ownership", "Renounce deployer ownership").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_20} = await import(
      "../../deploy/tasks/deployments/full-deployment/steps/20_renounceOwnership"
    );
    await step_20(ETHERSCAN_VERIFICATION);
  }
);
