import {deployHelperContractImpl} from "../../helpers/contracts-deployments";
import {
  getInitializableAdminUpgradeabilityProxy,
  getHelperContract,
} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {getParaSpaceConfig, waitForTx} from "../../helpers/misc-utils";

export const upgradeHelperContract = async (verify = false) => {
  console.time("deploy HelperContract");
  const paraSpaceConfig = getParaSpaceConfig();
  const helperContractImpl = await deployHelperContractImpl(
    paraSpaceConfig.ParaSpaceV1!.CApeV1,
    verify
  );
  const helperContract = await getHelperContract();
  const helperContractProxy = await getInitializableAdminUpgradeabilityProxy(
    helperContract.address
  );
  console.timeEnd("deploy HelperContract");

  console.time("upgrade HelperContract");
  if (DRY_RUN) {
    const encodedData = helperContractProxy.interface.encodeFunctionData(
      "upgradeTo",
      [helperContractImpl.address]
    );
    await dryRunEncodedData(helperContractProxy.address, encodedData);
  } else {
    await waitForTx(
      await helperContractProxy.upgradeTo(
        helperContractImpl.address,
        GLOBAL_OVERRIDES
      )
    );
  }
  console.timeEnd("upgrade HelperContract");
};
