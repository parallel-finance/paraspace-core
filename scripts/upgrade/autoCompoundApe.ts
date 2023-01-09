import {deployAutoCompoundApeImpl} from "../../helpers/contracts-deployments";
import {
  getAutoCompoundApe,
  getInitializableAdminUpgradeabilityProxy,
} from "../../helpers/contracts-getters";
import {printEncodedData} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

export const upgradeAutoCompoundApe = async (verify = false) => {
  console.time("deploy AutocompoundApe");
  const cAPEImpl = await deployAutoCompoundApeImpl(verify);
  const cAPE = await getAutoCompoundApe();
  const cAPEProxy = await getInitializableAdminUpgradeabilityProxy(
    cAPE.address
  );
  console.timeEnd("deploy AutocompoundApe");

  console.time("upgrade AutocompoundApe");
  if (DRY_RUN) {
    const encodedData = cAPEProxy.interface.encodeFunctionData("upgradeTo", [
      cAPEImpl.address,
    ]);
    await printEncodedData(cAPEProxy.address, encodedData);
  } else {
    await waitForTx(
      await cAPEProxy.upgradeTo(cAPEImpl.address, GLOBAL_OVERRIDES)
    );
  }
  console.timeEnd("upgrade AutocompoundApe");
};
