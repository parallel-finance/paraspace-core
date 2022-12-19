import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:pool-configurator", "Deploy pool configurator").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_07} = await import(
      "../../scripts/deployments/steps/07_poolConfigurator"
    );
    await step_07(ETHERSCAN_VERIFICATION);
  }
);
