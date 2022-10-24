import {task} from "hardhat/config";

task("deploy:delete-db", "Delete Db").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {step_00} = await import(
      "../../deploy/tasks/deployments/testnet/steps/00_deleteDb"
    );
    await step_00();
  }
);
