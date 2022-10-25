import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:acl-manager", "Deploy ACL manager").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_05} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/05_aclManager"
  );
  await step_05(verify);
});
