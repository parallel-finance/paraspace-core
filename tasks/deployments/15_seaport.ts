import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:seaport", "Deploy seaport").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_15} = await import("../../scripts/deployments/steps/15_seaport");
  await step_15(ETHERSCAN_VERIFICATION);
});
