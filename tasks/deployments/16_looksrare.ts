import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:looksrare", "Deploy looksrare").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_16} = await import(
    "../../scripts/deployments/steps/16_looksrare"
  );
  await step_16(ETHERSCAN_VERIFICATION);
});
