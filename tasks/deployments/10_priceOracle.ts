import {task} from "hardhat/config";
import {step_10} from "../../deploy/tasks/deployments/testnet/steps/10_priceOracle";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:price-oracle", "Deploy price oracle")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_10(verify)
  })
