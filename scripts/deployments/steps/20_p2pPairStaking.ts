import {
  deployParaApeStaking,
  deployParaApeStakingImpl,
} from "../../../helpers/contracts-deployments";
import {
  getFirstSigner,
  getInitializableAdminUpgradeabilityProxy,
  getParaApeStaking,
} from "../../../helpers/contracts-getters";
import {getParaSpaceConfig, waitForTx} from "../../../helpers/misc-utils";
import {ERC20TokenContractId} from "../../../helpers/types";
import {GLOBAL_OVERRIDES} from "../../../helpers/hardhat-constants";
import {InitializableAdminUpgradeabilityProxy} from "../../../types";

export const step_20 = async (verify = false) => {
  const paraSpaceConfig = getParaSpaceConfig();
  try {
    if (!paraSpaceConfig.ReservesConfig[ERC20TokenContractId.APE]) {
      return;
    }

    const paraApeStaking = await getParaApeStaking();
    //upgrade to non-fake implementation
    if (paraApeStaking) {
      const paraApeStakingImpl = await deployParaApeStakingImpl(verify);
      const paraApeStakingProxy =
        await getInitializableAdminUpgradeabilityProxy(paraApeStaking.address);

      const deployer = await getFirstSigner();
      const deployerAddress = await deployer.getAddress();
      const initData =
        paraApeStakingImpl.interface.encodeFunctionData("initialize");

      await waitForTx(
        await (paraApeStakingProxy as InitializableAdminUpgradeabilityProxy)[
          "initialize(address,address,bytes)"
        ](
          paraApeStakingImpl.address,
          deployerAddress,
          initData,
          GLOBAL_OVERRIDES
        )
      );
    } else {
      await deployParaApeStaking(false, verify);
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
