import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy: misc", "Deploy misc contract").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_19} = await import("../../scripts/deployments/steps/19_misc");
  await step_19(ETHERSCAN_VERIFICATION);
});
