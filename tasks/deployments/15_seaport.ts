import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../deploy/helpers/hardhat-constants";

task("deploy:seaport", "Deploy seaport").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_15} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/15_seaport"
  );
  await step_15(ETHERSCAN_VERIFICATION);
});
