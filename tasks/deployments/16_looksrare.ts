import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../deploy/helpers/hardhat-constants";

task("deploy:looksrare", "Deploy looksrare").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_16} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/16_looksrare"
  );
  await step_16(ETHERSCAN_VERIFICATION);
});
