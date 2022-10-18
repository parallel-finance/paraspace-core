import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task(
  "deploy:faucet",
  "Deploy faucet for mocked ERC20 & ERC721 tokens"
).setAction(async (_, DRE) => {
  const {step_03} = await import(
    "../../deploy/tasks/deployments/testnet/steps/03_faucet"
  );
  await DRE.run("set-DRE");
  await step_03(verify);
});
