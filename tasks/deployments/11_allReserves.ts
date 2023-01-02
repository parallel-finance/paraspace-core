import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:all-reserves", "Deploy all reserves").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_11} = await import(
    "../../scripts/deployments/steps/11_allReserves"
  );
  await step_11(ETHERSCAN_VERIFICATION);
});
