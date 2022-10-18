import {task} from "hardhat/config";
import {step_18} from "../../deploy/tasks/deployments/testnet/steps/18_flashClaimRegistry";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:flash-claim-registry", "Deploy flash claim registry")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_18(verify)
  })
