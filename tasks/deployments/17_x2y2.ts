import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:x2y2", "Deploy x2y2").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_17} = await import("../../scripts/deployments/steps/17_x2y2");
  await step_17(ETHERSCAN_VERIFICATION);
});
