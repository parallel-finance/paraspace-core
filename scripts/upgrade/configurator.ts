import {deployPoolConfigurator} from "../../helpers/contracts-deployments";
import {getPoolAddressesProvider} from "../../helpers/contracts-getters";
import {GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

export const upgradeConfigurator = async (verify = false) => {
  const addressesProvider = await getPoolAddressesProvider();
  console.time("deploy PoolConfigurator");
  const poolConfiguratorImpl = await deployPoolConfigurator(verify);
  console.timeEnd("deploy PoolConfigurator");

  console.time("upgrade PoolConfigurator");
  await waitForTx(
    await addressesProvider.setPoolConfiguratorImpl(
      poolConfiguratorImpl.address,
      GLOBAL_OVERRIDES
    )
  );
  console.timeEnd("upgrade PoolConfigurator");
};
