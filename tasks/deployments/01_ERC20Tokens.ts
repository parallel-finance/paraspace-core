import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../deploy/helpers/hardhat-constants";

task("deploy:erc20-tokens", "Deploy ERC20 tokens").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_01} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/01_ERC20Tokens"
  );
  await step_01(ETHERSCAN_VERIFICATION);
});
