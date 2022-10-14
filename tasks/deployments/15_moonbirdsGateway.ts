import {task} from "hardhat/config";
import {step_15} from "../../deploy/tasks/deployments/testnet/steps/15_moonbirdsGateway";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:moonbirds-gateway", "Deploy moonbirds gateway")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_15(verify)
  })
