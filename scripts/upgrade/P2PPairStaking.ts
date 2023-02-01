import {deployP2PPairStakingImpl} from "../../helpers/contracts-deployments";
import {
  getInitializableAdminUpgradeabilityProxy,
  getP2PPairStaking,
} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

export const upgradeP2PPairStaking = async (verify = false) => {
  console.time("deploy P2PPairStaking");
  const p2pPairStakingImpl = await deployP2PPairStakingImpl(verify);
  const p2pPairStaking = await getP2PPairStaking();
  const p2pPairStakingProxy = await getInitializableAdminUpgradeabilityProxy(
    p2pPairStaking.address
  );
  console.timeEnd("deploy P2PPairStaking");

  console.time("upgrade P2PPairStaking");
  if (DRY_RUN) {
    const encodedData = p2pPairStakingProxy.interface.encodeFunctionData(
      "upgradeTo",
      [p2pPairStakingImpl.address]
    );
    await dryRunEncodedData(p2pPairStakingProxy.address, encodedData);
  } else {
    await waitForTx(
      await p2pPairStakingProxy.upgradeTo(
        p2pPairStakingImpl.address,
        GLOBAL_OVERRIDES
      )
    );
  }
  console.timeEnd("upgrade P2PPairStaking");
};
