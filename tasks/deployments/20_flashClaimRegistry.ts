import {task} from "hardhat/config";
import {step_19} from "../../deploy/tasks/deployments/testnet/steps/19_flashClaimRegistry";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:flash-claim-registry", "Deploy flash claim registry")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_19(verify)
  })
