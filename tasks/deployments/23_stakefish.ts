import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:stakefish", "Deploy Stakefish").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_23} = await import(
    "../../scripts/deployments/steps/23_stakefish"
  );
  await step_23(ETHERSCAN_VERIFICATION);
});
