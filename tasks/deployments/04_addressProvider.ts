import {task} from "hardhat/config";
import {step_04} from "../../deploy/tasks/deployments/testnet/steps/04_addressProvider";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:address-provider", "Deploy addresses provider")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_04(verify)
  })
