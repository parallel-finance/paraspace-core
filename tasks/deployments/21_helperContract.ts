import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:HelperContract", "Deploy HelperContract").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_21} = await import(
      "../../scripts/deployments/steps/21_helperContract"
    );
    await step_21(ETHERSCAN_VERIFICATION);
  }
);
