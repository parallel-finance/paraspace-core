import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:timelock", "Deploy TimeLock").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_22} = await import("../../scripts/deployments/steps/22_timelock");
  await step_22(ETHERSCAN_VERIFICATION);
});
