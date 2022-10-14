import {task} from "hardhat/config";
import {step_16} from "../../deploy/tasks/deployments/testnet/steps/16_uniswapV3Gateway";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:uniswap-v3-gateway", "Deploy uniswap v3 gateway")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_16(verify)
  })
