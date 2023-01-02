import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:blur-exchange", "Deploy Blur Exchange").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_18} = await import("../../scripts/deployments/steps/18_blur");
    await step_18(ETHERSCAN_VERIFICATION);
  }
);
