import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task(
  "deploy:faucet",
  "Deploy faucet for mocked ERC20 & ERC721 tokens"
).setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_03} = await import("../../scripts/deployments/steps/03_faucet");
  await step_03(ETHERSCAN_VERIFICATION);
});
