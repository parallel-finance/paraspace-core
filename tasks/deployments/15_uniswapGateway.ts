import {task} from "hardhat/config";
import {step_15} from "../../deploy/tasks/deployments/testnet/steps/15_uniswapV3Gateway";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:uniswap-v3-gateway", "Deploy uniswap v3 gateway")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_15(verify)
  })
