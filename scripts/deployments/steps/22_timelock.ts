import {deployTimeLockImplAssignItToProxy} from "../../../helpers/contracts-deployments";
import {getPoolAddressesProvider} from "../../../helpers/contracts-getters";
export const step_22 = async (verify = false) => {
  try {
    const addressesProvider = await getPoolAddressesProvider();

    await deployTimeLockImplAssignItToProxy(addressesProvider.address, verify);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
