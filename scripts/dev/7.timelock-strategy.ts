import rawBRE from "hardhat";
import {deployReserveTimeLockStrategy} from "../../helpers/contracts-deployments";
import {
  getPoolConfiguratorProxy,
  getPoolProxy,
} from "../../helpers/contracts-getters";
import {timeLockStrategyOTHR} from "../../market-config/timeLockStrategies";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {waitForTx} from "../../helpers/misc-utils";

const deployTimeLockStrategy = async (verify = false) => {
  console.time("deploy:new-timelock-strategy");
  const pool = await getPoolProxy();
  const configurator = await getPoolConfiguratorProxy();
  const strategy = await deployReserveTimeLockStrategy(
    timeLockStrategyOTHR.name,
    pool.address,
    timeLockStrategyOTHR.minThreshold,
    timeLockStrategyOTHR.midThreshold,
    timeLockStrategyOTHR.minWaitTime,
    timeLockStrategyOTHR.midWaitTime,
    timeLockStrategyOTHR.maxWaitTime,
    timeLockStrategyOTHR.poolPeriodLimit,
    timeLockStrategyOTHR.poolPeriodWaitTime,
    timeLockStrategyOTHR.period,
    verify
  );

  if (DRY_RUN) {
    const encodedData = configurator.interface.encodeFunctionData(
      "setReserveTimeLockStrategyAddress",
      ["0x34d85c9cdeb23fa97cb08333b511ac86e1c4e258", strategy.address]
    );
    await dryRunEncodedData(configurator.address, encodedData);
  } else {
    await waitForTx(
      await configurator.setReserveTimeLockStrategyAddress(
        "0x34d85c9cdeb23fa97cb08333b511ac86e1c4e258",
        strategy.address,
        GLOBAL_OVERRIDES
      )
    );
  }
  console.log("strategy:", strategy.address);
  console.timeEnd("deploy:new-timelock-strategy");
};

async function main() {
  await rawBRE.run("set-DRE");
  await deployTimeLockStrategy();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
