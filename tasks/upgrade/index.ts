import {task} from "hardhat/config";
import {ETHERSCAN_VERIFICATION} from "../../helpers/hardhat-constants";

task("upgrade:all", "upgrade all").setAction(async (_, DRE) => {
  const {upgradeAll} = await import("../../scripts/upgrade");
  await DRE.run("set-DRE");
  console.time("upgrade all");
  await upgradeAll(ETHERSCAN_VERIFICATION);
  console.timeEnd("upgrade all");
});

task("reset:pool", "reset pool function selectors").setAction(
  async (_, DRE) => {
    const {resetPool} = await import("../../scripts/upgrade/pool");
    await DRE.run("set-DRE");
    console.time("reset pool");
    await resetPool(ETHERSCAN_VERIFICATION);
    console.timeEnd("reset pool");
  }
);

task("upgrade:pool", "upgrade pool components")
  .addPositionalParam("oldPoolCore", "old pool core")
  .addPositionalParam("oldPoolApeStaking", "old pool ape staking")
  .addPositionalParam("oldPoolMarketplace", "old pool marketplace")
  .addPositionalParam("oldPoolParameters", "old pool parameters")
  .setAction(async (args, DRE) => {
    const {upgradePool} = await import("../../scripts/upgrade/pool");
    await DRE.run("set-DRE");
    console.time("upgrade pool");
    await upgradePool(args, ETHERSCAN_VERIFICATION);
    console.timeEnd("upgrade pool");
  });

task("upgrade:pool-core", "upgrade pool core")
  .addPositionalParam("oldPoolCore", "old pool core")
  .setAction(async ({oldPoolCore}, DRE) => {
    const {upgradePoolCore} = await import("../../scripts/upgrade/pool");
    await DRE.run("set-DRE");
    console.time("upgrade poolCore");
    await upgradePoolCore(oldPoolCore, ETHERSCAN_VERIFICATION);
    console.timeEnd("upgrade poolCore");
  });

task("upgrade:pool-marketplace", "upgrade pool marketplace")
  .addPositionalParam("oldPoolMarketplace", "old pool marketplace")
  .setAction(async ({oldPoolMarketplace}, DRE) => {
    const {upgradePoolMarketplace} = await import("../../scripts/upgrade/pool");
    await DRE.run("set-DRE");
    console.time("upgrade poolMarketplace");
    await upgradePoolMarketplace(oldPoolMarketplace, ETHERSCAN_VERIFICATION);
    console.timeEnd("upgrade poolMarketplace");
  });

task("upgrade:pool-ape-staking", "upgrade pool ape staking")
  .addPositionalParam("oldPoolApeStaking", "old pool ape staking")
  .setAction(async ({oldPoolApeStaking}, DRE) => {
    const {upgradePoolApeStaking} = await import("../../scripts/upgrade/pool");
    await DRE.run("set-DRE");
    console.time("upgrade poolApeStaking");
    await upgradePoolApeStaking(oldPoolApeStaking, ETHERSCAN_VERIFICATION);
    console.timeEnd("upgrade poolApeStaking");
  });

task("upgrade:borrow-ape-and-stake", "upgrade borrow ape and stake")
  .addPositionalParam("oldPoolBorrowAndStake", "old pool borrow and stake")
  .setAction(async ({oldPoolBorrowAndStake}, DRE) => {
    const {upgradeBorrowApeAndStake} = await import(
      "../../scripts/upgrade/pool"
    );
    await DRE.run("set-DRE");
    console.time("upgrade borrowApeAndStake");
    await upgradeBorrowApeAndStake(
      oldPoolBorrowAndStake,
      ETHERSCAN_VERIFICATION
    );
    console.timeEnd("upgrade borrowApeAndStake");
  });

task("upgrade:pool-parameters", "upgrade pool parameters")
  .addPositionalParam("oldPoolParameters", "old pool parameters")
  .setAction(async ({oldPoolParameters}, DRE) => {
    const {upgradePoolParameters} = await import("../../scripts/upgrade/pool");
    await DRE.run("set-DRE");
    console.time("upgrade poolParameters");
    await upgradePoolParameters(oldPoolParameters, ETHERSCAN_VERIFICATION);
    console.timeEnd("upgrade poolParameters");
  });

task("upgrade:pool-position-mover", "upgrade pool position mover")
  .addPositionalParam("oldPoolPositionMover", "old pool position mover")
  .setAction(async ({oldPoolPositionMover}, DRE) => {
    const {upgradePoolPositionMover} = await import(
      "../../scripts/upgrade/pool"
    );
    await DRE.run("set-DRE");
    console.time("upgrade poolPositionMover");
    await upgradePoolPositionMover(
      oldPoolPositionMover,
      ETHERSCAN_VERIFICATION
    );
    console.timeEnd("upgrade poolPositionMover");
  });

task("upgrade:pool-aa-position-mover", "upgrade pool aa position mover")
  .addPositionalParam("oldPoolAAPositionMover", "old pool aa position mover")
  .setAction(async ({oldPoolAAPositionMover}, DRE) => {
    const {upgradePoolAAPositionMover} = await import(
      "../../scripts/upgrade/pool"
    );
    await DRE.run("set-DRE");
    console.time("upgrade poolAAPositionMover");
    await upgradePoolAAPositionMover(
      oldPoolAAPositionMover,
      ETHERSCAN_VERIFICATION
    );
    console.timeEnd("upgrade poolAAPositionMover");
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

task("upgrade:auto-compound-ape", "upgrade auto compound ape").setAction(
  async (_, DRE) => {
    const {upgradeAutoCompoundApe} = await import(
      "../../scripts/upgrade/autoCompoundApe"
    );
    await DRE.run("set-DRE");
    console.time("upgrade auto compound ape");
    await upgradeAutoCompoundApe(ETHERSCAN_VERIFICATION);
    console.timeEnd("upgrade auto compound ape");
  }
);

task("upgrade:timelock", "upgrade timelock").setAction(async (_, DRE) => {
  const {upgradeTimeLock} = await import("../../scripts/upgrade/timeLock");
  await DRE.run("set-DRE");
  console.time("upgrade timelock");
  await upgradeTimeLock(ETHERSCAN_VERIFICATION);
  console.timeEnd("upgrade timelock");
});

task("upgrade:para-ape-staking", "upgrade para ape staking").setAction(
  async (_, DRE) => {
    const {upgradeParaApeStaking} = await import(
      "../../scripts/upgrade/para_ape_staking"
    );
    await DRE.run("set-DRE");
    console.time("upgrade para ape staking");
    await upgradeParaApeStaking(ETHERSCAN_VERIFICATION);
    console.timeEnd("upgrade para ape staking");
  }
);

task("upgrade:helper-contract", "upgrade helper contract").setAction(
  async (_, DRE) => {
    const {upgradeHelperContract} = await import(
      "../../scripts/upgrade/helperContract"
    );
    await DRE.run("set-DRE");
    console.time("upgrade helper contract");
    await upgradeHelperContract(ETHERSCAN_VERIFICATION);
    console.timeEnd("upgrade helper contract");
  }
);

task("upgrade:account-abstraction", "upgrade account abstraction").setAction(
  async (_, DRE) => {
    const {upgradeAccountAbstraction} = await import(
      "../../scripts/upgrade/accountAbstraction"
    );
    await DRE.run("set-DRE");
    console.time("upgrade account abstraction");
    await upgradeAccountAbstraction(ETHERSCAN_VERIFICATION);
    console.timeEnd("upgrade account abstraction");
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
