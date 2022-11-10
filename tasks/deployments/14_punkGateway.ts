import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../deploy/helpers/hardhat-constants";

task("deploy:punk-gateway", "Deploy punk gateway").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_14} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/14_punkGateway"
  );
  await step_14(ETHERSCAN_VERIFICATION);
});
