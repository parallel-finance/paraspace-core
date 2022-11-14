import {task} from "hardhat/config";

task("upgrade:all", "upgrade all").setAction(async (_, DRE) => {
  const {upgradeAll} = await import(
    "../../deploy/tasks/deployments/upgrade/upgrade"
  );
  await DRE.run("set-DRE");
  console.time("upgrade");
  await upgradeAll();
  console.time("upgrade");
});

task("upgrade:pool", "upgrade pool components").setAction(async (_, DRE) => {
  const {upgradePool} = await import(
    "../../deploy/tasks/deployments/upgrade/upgrade"
  );
  await DRE.run("set-DRE");
  console.time("upgrade");
  await upgradePool();
  console.time("upgrade");
});

task("upgrade:ptoken", "upgrade ptoken").setAction(async (_, DRE) => {
  const {upgradePToken} = await import(
    "../../deploy/tasks/deployments/upgrade/upgrade_ptoken"
  );
  await DRE.run("set-DRE");
  console.time("upgrade ptoken");
  await upgradePToken();
  console.time("upgrade ptoken done.");
});

task("upgrade:ntoken", "upgrade ntoken").setAction(async (_, DRE) => {
  const {upgradeNToken} = await import(
    "../../deploy/tasks/deployments/upgrade/upgrade_ntoken"
  );
  await DRE.run("set-DRE");
  console.time("upgrade ntoken");
  await upgradeNToken();
  console.time("upgrade ntoken done.");
});

task("upgrade:ntoken_moonbirds", "upgrade ntoken moonbirds").setAction(
  async (_, DRE) => {
    const {upgradeNTokenMoonBirds} = await import(
      "../../deploy/tasks/deployments/upgrade/upgrade_ntoken_moonbirds"
    );
    await DRE.run("set-DRE");
    console.time("upgrade ntoken moonbirds");
    await upgradeNTokenMoonBirds();
    console.time("upgrade ntoken moonbirds done.");
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
    console.time("upgrade ntoken uniswapV3 done.");
  }
);
