import {deployTimeLockImpl} from "../../helpers/contracts-deployments";
import {
  getTimeLockProxy,
  getInitializableAdminUpgradeabilityProxy,
  getPoolAddressesProvider,
} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

export const upgradeTimeLock = async (verify = false) => {
  console.time("deploy TimeLock");
  const provider = await getPoolAddressesProvider();
  const timeLockImpl = await deployTimeLockImpl(provider.address, verify);
  const timeLock = await getTimeLockProxy();
  const timeLockProxy = await getInitializableAdminUpgradeabilityProxy(
    timeLock.address
  );
  console.timeEnd("deploy TimeLock");

  console.time("upgrade TimeLock");
  if (DRY_RUN) {
    const encodedData = timeLockProxy.interface.encodeFunctionData(
      "upgradeTo",
      [timeLockImpl.address]
    );
    await dryRunEncodedData(timeLockProxy.address, encodedData);
  } else {
    await waitForTx(
      await timeLockProxy.upgradeTo(timeLockImpl.address, GLOBAL_OVERRIDES)
    );
  }
  console.timeEnd("upgrade TimeLock");
};
