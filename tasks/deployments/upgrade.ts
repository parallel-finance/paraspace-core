import {task} from "hardhat/config";
import {printContracts} from "../../deploy/helpers/misc-utils";

task("upgrade:all", "upgrade all").setAction(async (_, DRE) => {
  const {upgradeAll} = await import(
    "../../deploy/tasks/deployments/upgrade/upgrade"
  );
  await DRE.run("set-DRE");
  console.time("upgrade all");
  await upgradeAll();
  await printContracts();
  console.timeEnd("upgrade all");
});

task("upgrade:pool", "upgrade pool components").setAction(async (_, DRE) => {
  const {upgradePool} = await import(
    "../../deploy/tasks/deployments/upgrade/upgrade"
  );
  await DRE.run("set-DRE");
  console.time("upgrade pool");
  await upgradePool();
  console.timeEnd("upgrade pool");
});

task("upgrade:clean-pool", "clean pool components").setAction(
  async (_, DRE) => {
    const {cleanPool} = await import(
      "../../deploy/tasks/deployments/upgrade/upgrade"
    );
    await DRE.run("set-DRE");
    console.time("clean pool");
    await cleanPool();
    console.timeEnd("clean pool");
  }
);

task("upgrade:ptoken", "upgrade ptoken").setAction(async (_, DRE) => {
  const {upgradePToken} = await import(
    "../../deploy/tasks/deployments/upgrade/upgrade_ptoken"
  );
  await DRE.run("set-DRE");
  console.time("upgrade ptoken");
  await upgradePToken();
  console.timeEnd("upgrade ptoken");
});

task("upgrade:ntoken", "upgrade ntoken").setAction(async (_, DRE) => {
  const {upgradeNToken} = await import(
    "../../deploy/tasks/deployments/upgrade/upgrade_ntoken"
  );
  await DRE.run("set-DRE");
  console.time("upgrade ntoken");
  await upgradeNToken();
  console.timeEnd("upgrade ntoken");
});

task("upgrade:ntoken_moonbirds", "upgrade ntoken moonbirds").setAction(
  async (_, DRE) => {
    const {upgradeNTokenMoonBirds} = await import(
      "../../deploy/tasks/deployments/upgrade/upgrade_ntoken_moonbirds"
    );
    await DRE.run("set-DRE");
    console.time("upgrade ntoken moonbirds");
    await upgradeNTokenMoonBirds();
    console.timeEnd("upgrade ntoken moonbirds");
  }
);

task("upgrade:ntoken_uniswapv3", "upgrade ntoken uniswapv3").setAction(
  async (_, DRE) => {
    const {upgradeNTokenUniswapV3} = await import(
      "../../deploy/tasks/deployments/upgrade/upgrade_ntoken_uniswapv3"
    );
    await DRE.run("set-DRE");
    console.time("upgrade ntoken uniswapV3");
    await upgradeNTokenUniswapV3();
    console.timeEnd("upgrade ntoken uniswapV3");
  }
);
