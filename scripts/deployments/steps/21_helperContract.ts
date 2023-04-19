import {deployHelperContract} from "../../../helpers/contracts-deployments";
import {getParaSpaceConfig} from "../../../helpers/misc-utils";
import {ERC20TokenContractId} from "../../../helpers/types";
export const step_21 = async (verify = false) => {
  const paraSpaceConfig = getParaSpaceConfig();
  try {
    if (!paraSpaceConfig.ReservesConfig[ERC20TokenContractId.APE]) {
      return;
    }

    await deployHelperContract(verify);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
