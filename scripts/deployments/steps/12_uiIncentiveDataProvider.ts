import {deployUiIncentiveDataProvider} from "../../../helpers/contracts-deployments";

export const step_12 = async (verify = false) => {
  try {
    return await deployUiIncentiveDataProvider(verify);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
