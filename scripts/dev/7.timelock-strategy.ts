import rawBRE from "hardhat";
import {deployReserveTimeLockStrategy} from "../../helpers/contracts-deployments";
import {getPoolProxy} from "../../helpers/contracts-getters";
import {timeLockStrategyOTHR} from "../../market-config/timeLockStrategies";

const deployTimeLockStrategy = async (verify = false) => {
  console.time("deploy:new-timelock-strategy");
  const pool = await getPoolProxy();
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
