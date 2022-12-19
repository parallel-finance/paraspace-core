import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:fallback-oracle", "Deploy fallback oracle").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_09} = await import(
      "../../scripts/deployments/steps/09_fallbackOracle"
    );
    await step_09(ETHERSCAN_VERIFICATION);
  }
);
