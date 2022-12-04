import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../deploy/helpers/hardhat-constants";

task("deploy:renounce-ownership", "Renounce deployer ownership")
  .addPositionalParam("newAdmin", "New Admin Address")
  .setAction(async (action, DRE) => {
    await DRE.run("set-DRE");
    console.log(action);
    const {step_20} = await import(
      "../../deploy/tasks/deployments/full-deployment/steps/20_renounceOwnership"
    );
    await step_20(ETHERSCAN_VERIFICATION);
  });
