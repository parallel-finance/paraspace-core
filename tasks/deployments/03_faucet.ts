import {task} from "hardhat/config";
import {step_03} from "../../deploy/tasks/deployments/testnet/steps/03_faucet";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:faucet", "Deploy faucet for mocked ERC20 & ERC721 tokens")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_03(verify)
  })
