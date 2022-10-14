import {task} from "hardhat/config";
import {step_13} from "../../deploy/tasks/deployments/testnet/steps/13_wethGateway";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:weth-gateway", "Deploy weth gateway")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_13(verify)
  })
