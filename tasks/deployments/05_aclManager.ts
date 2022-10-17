import {task} from "hardhat/config";
import {step_05} from "../../deploy/tasks/deployments/testnet/steps/05_aclManager";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:acl-manager", "Deploy ACL manager")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
    await step_05(verify)
  })
