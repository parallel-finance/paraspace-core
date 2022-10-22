import {task} from "hardhat/config";

task("upgrade:all", "upgrade all").setAction(async (_, DRE) => {
    const {upgradeAll} = await import("../../deploy/tasks/deployments/full-deployment/upgrade");
    await DRE.run("set-DRE");
    console.time("upgrade");
    await upgradeAll();
    console.time("upgrade");
  }
);

task("upgrade:pool", "upgrade pool components").setAction(async (_, DRE) => {
    const {upgradePool} = await import("../../deploy/tasks/deployments/full-deployment/upgrade");
    await DRE.run("set-DRE");
    console.time("upgrade");
    await upgradePool();
    console.time("upgrade");
  }
);
