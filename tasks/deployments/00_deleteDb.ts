import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../deploy/helpers/hardhat-constants";

task("deploy:delete-db", "Delete Db").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_00} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/00_deleteDb"
  );
  await step_00(ETHERSCAN_VERIFICATION);
});
