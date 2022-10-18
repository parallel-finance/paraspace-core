import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:acl-manager", "Deploy ACL manager").setAction(async (_, DRE) => {
  const {step_05} = await import(
    "../../deploy/tasks/deployments/testnet/steps/05_aclManager"
  );
  await DRE.run("set-DRE");
  await step_05(verify);
});
