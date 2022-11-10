import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../deploy/helpers/hardhat-constants";

task(
  "deploy:ui-incentive-data-provider",
  "Deploy UI incentive data provider"
).setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_12} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/12_uiIncentiveDataProvider"
  );
  await step_12(ETHERSCAN_VERIFICATION);
});
