import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../deploy/helpers/hardhat-constants";

task("deploy:pool", "Deploy pool components").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_06} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/06_pool"
  );
  await step_06(ETHERSCAN_VERIFICATION);
});
