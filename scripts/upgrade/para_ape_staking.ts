import {deployParaApeStakingImpl} from "../../helpers/contracts-deployments";
import {
  getInitializableAdminUpgradeabilityProxy,
  getParaApeStaking,
} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

export const upgradeParaApeStaking = async (verify = false) => {
  console.time("deploy ParaApeStaking");
  const paraApeStakingImpl = await deployParaApeStakingImpl(verify);
  const paraApeStaking = await getParaApeStaking();
  const paraApeStakingProxy = await getInitializableAdminUpgradeabilityProxy(
    paraApeStaking.address
  );
  console.timeEnd("deploy ParaApeStaking");

  console.time("upgrade ParaApeStaking");
  if (DRY_RUN) {
    const encodedData = paraApeStakingProxy.interface.encodeFunctionData(
      "upgradeTo",
      [paraApeStakingImpl.address]
    );
    await dryRunEncodedData(paraApeStakingProxy.address, encodedData);
  } else {
    await waitForTx(
      await paraApeStakingProxy.upgradeTo(
        paraApeStakingImpl.address,
        GLOBAL_OVERRIDES
      )
    );
  }
  console.timeEnd("upgrade ParaApeStaking");
};
