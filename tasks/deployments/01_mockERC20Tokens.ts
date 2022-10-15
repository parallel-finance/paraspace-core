import {task} from "hardhat/config";
import {step_01} from "../../deploy/tasks/deployments/testnet/steps/01_mockERC20Tokens";

import dotenv from "dotenv"

dotenv.config();

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:mock-erc20-tokens", "Deploy mocked ERC20 tokens")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    console.log(verify)
    await step_01(verify)
  })
