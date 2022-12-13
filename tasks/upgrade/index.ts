import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("upgrade:all", "upgrade all").setAction(async (_, DRE) => {
  const {upgradeAll} = await import("../../scripts/upgrade");
  await DRE.run("set-DRE");
  console.time("upgrade all");
  await upgradeAll(ETHERSCAN_VERIFICATION);
  console.timeEnd("upgrade all");
});

task("upgrade:pool", "upgrade pool components").setAction(async (_, DRE) => {
  const {upgradePool} = await import("../../scripts/upgrade");
  await DRE.run("set-DRE");
  console.time("upgrade pool");
  await upgradePool(ETHERSCAN_VERIFICATION);
  console.timeEnd("upgrade pool");
});

task("upgrade:configurator", "upgrade pool configurator").setAction(
  async (_, DRE) => {
    const {upgradeConfigurator} = await import(
      "../../scripts/upgrade/configurator"
    );
    await DRE.run("set-DRE");
    console.time("upgrade configurator");
    await upgradeConfigurator(ETHERSCAN_VERIFICATION);
    console.timeEnd("upgrade configurator");
  }
);

task("upgrade:remove-pool-funcs", "clean pool components").setAction(
  async (_, DRE) => {
    const {removePoolFuncs} = await import("../../scripts/upgrade");
    await DRE.run("set-DRE");
    console.time("remove pool funcs");
    await removePoolFuncs();
    console.timeEnd("remove pool funcs");
  }
);

task("upgrade:add-pool-funcs", "add pool components").setAction(
  async (_, DRE) => {
    const {addPoolFuncs} = await import("../../scripts/upgrade");
    await DRE.run("set-DRE");
    console.time("add pool funcs");
    await addPoolFuncs(ETHERSCAN_VERIFICATION);
    console.timeEnd("add pool funcs");
  }
);

task("upgrade:ptoken", "upgrade ptoken").setAction(async (_, DRE) => {
  const {upgradePToken} = await import("../../scripts/upgrade/ptoken");
  await DRE.run("set-DRE");
  console.time("upgrade ptoken");
  await upgradePToken(ETHERSCAN_VERIFICATION);
  console.timeEnd("upgrade ptoken");
});

task("upgrade:ntoken", "upgrade ntoken").setAction(async (_, DRE) => {
  const {upgradeNToken} = await import("../../scripts/upgrade/ntoken");
  await DRE.run("set-DRE");
  console.time("upgrade ntoken");
  await upgradeNToken(ETHERSCAN_VERIFICATION);
  console.timeEnd("upgrade ntoken");
});

task("upgrade:debt-token", "upgrade debt token").setAction(async (_, DRE) => {
  const {upgradeDebtToken} = await import("../../scripts/upgrade/debtToken");
  await DRE.run("set-DRE");
  console.time("upgrade debt token");
  await upgradeDebtToken(ETHERSCAN_VERIFICATION);
  console.timeEnd("upgrade debt token");
});
