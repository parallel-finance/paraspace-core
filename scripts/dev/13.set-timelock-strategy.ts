import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {deployReserveTimeLockStrategy} from "../../helpers/contracts-deployments";
import {
  getPoolAddressesProvider,
  getPoolConfiguratorProxy,
  getPoolProxy,
  getUiPoolDataProvider,
} from "../../helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../../helpers/contracts-helpers";
import {waitForTx} from "../../helpers/misc-utils";
import {eContractid} from "../../helpers/types";

const setTimeLockStrategy = async () => {
  console.time("set-timelock-strategy");

  const ui = await getUiPoolDataProvider();
  const pool = await getPoolProxy();
  const provider = await getPoolAddressesProvider();
  const [reservesData] = await ui.getReservesData(provider.address);
  for (const x of reservesData) {
    if (
      (await pool.getReserveData(x.underlyingAsset)).timeLockStrategyAddress !=
      ZERO_ADDRESS
    ) {
      continue;
    }
    const minTime = 5;
    const midTime = 300;
    const maxTime = 3600;
    const poolPeriodWaitTime = 40;
    const period = 86400;

    const minThreshold = await convertToCurrencyDecimals(
      x.underlyingAsset,
      x.assetType == 0 ? "1000" : "5"
    );
    const midThreshold = await convertToCurrencyDecimals(
      x.underlyingAsset,
      x.assetType == 0 ? "10000" : "10"
    );

    const defaultStrategy = await deployReserveTimeLockStrategy(
      eContractid.DefaultTimeLockStrategy,
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
        x.underlyingAsset,
        defaultStrategy.address
      )
    );
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
