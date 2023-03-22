import {BigNumber} from "ethers";
import {parseUnits} from "ethers/lib/utils";
import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {deployDefaultTimeLockStrategy} from "../../helpers/contracts-deployments";
import {
  getPoolConfiguratorProxy,
  getPoolProxy,
  getProtocolDataProvider,
} from "../../helpers/contracts-getters";
import {GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

const setTimeLockStrategy = async () => {
  console.time("set-timelock-strategy");

  const ui = await getProtocolDataProvider();
  const pool = await getPoolProxy();
  const reservesData = await ui.getAllReservesTokens();
  for (const x of reservesData) {
    const reserveData = await pool.getReserveData(x.tokenAddress);
    const reserveConfiguration = (await pool.getConfiguration(x.tokenAddress))
      .data;
    const assetType = reserveConfiguration.shr(168).and(1);
    const decimals = reserveConfiguration.shr(48).and(255);
    if (reserveData.timeLockStrategyAddress != ZERO_ADDRESS) {
      continue;
    }
    const minTime = 5;
    const midTime = 300;
    const maxTime = 3600;
    const poolPeriodWaitTime = 40;
    const period = 86400;

    try {
      console.log(x.tokenAddress);
      const minThreshold = assetType.eq(0)
        ? parseUnits("1000", decimals)
        : BigNumber.from("5");
      const midThreshold = assetType.eq(0)
        ? parseUnits("10000", decimals)
        : BigNumber.from("10");

      const defaultStrategy = await deployDefaultTimeLockStrategy(
        (
          await getPoolProxy()
        ).address,
        minThreshold.toString(),
        midThreshold.toString(),
        minTime.toString(),
        midTime.toString(),
        maxTime.toString(),
        midThreshold.mul(10).toString(),
        poolPeriodWaitTime.toString(),
        period.toString()
      );

      const poolConfigurator = await getPoolConfiguratorProxy();
      await waitForTx(
        await poolConfigurator.setReserveTimeLockStrategyAddress(
          x.tokenAddress,
          defaultStrategy.address,
          GLOBAL_OVERRIDES
        )
      );
    } catch (e) {
      console.log(e, x.symbol);
    }
  }
  console.timeEnd("set-timelock-strategy");
};

async function main() {
  await rawBRE.run("set-DRE");
  await setTimeLockStrategy();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
