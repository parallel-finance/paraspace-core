import {deployHelperContract} from "../../../helpers/contracts-deployments";
export const step_21 = async (verify = false) => {
  try {
    await deployHelperContract(verify);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
