import {deployPoolConfigurator} from "../../../helpers/contracts-deployments";
import {
  getPoolAddressesProvider,
  getPoolConfiguratorProxy,
} from "../../../helpers/contracts-getters";
import {registerContractInDb} from "../../../helpers/contracts-helpers";
import {GLOBAL_OVERRIDES} from "../../../helpers/hardhat-constants";
import {getParaSpaceConfig, waitForTx} from "../../../helpers/misc-utils";
import {eContractid} from "../../../helpers/types";

export const step_07 = async (verify = false) => {
  const addressesProvider = await getPoolAddressesProvider();

  try {
    const poolConfiguratorImpl = await deployPoolConfigurator(verify);
    await waitForTx(
      await addressesProvider.setPoolConfiguratorImpl(
        poolConfiguratorImpl.address,
        GLOBAL_OVERRIDES
      )
    );
    const poolConfiguratorProxy = await getPoolConfiguratorProxy(
      await addressesProvider.getPoolConfigurator()
    );
    await waitForTx(
      await poolConfiguratorProxy.setAuctionRecoveryHealthFactor(
        getParaSpaceConfig().AuctionRecoveryHealthFactor,
        GLOBAL_OVERRIDES
      )
    );
    await registerContractInDb(
      eContractid.PoolConfiguratorProxy,
      poolConfiguratorProxy,
      [addressesProvider.address]
    );
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
