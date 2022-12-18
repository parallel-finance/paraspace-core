import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:pool", "Deploy pool components").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_06} = await import("../../scripts/deployments/steps/06_pool");
  await step_06(ETHERSCAN_VERIFICATION);
});
