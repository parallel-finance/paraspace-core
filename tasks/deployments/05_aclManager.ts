import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("deploy:acl-manager", "Deploy ACL manager").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_05} = await import(
    "../../scripts/deployments/steps/05_aclManager"
  );
  await step_05(ETHERSCAN_VERIFICATION);
});
