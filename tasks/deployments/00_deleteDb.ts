import {task} from "hardhat/config";

task("deploy:delete-db", "Delete Db").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {step_00} = await import("../../scripts/deployments/steps/00_deleteDb");
  await step_00();
});
