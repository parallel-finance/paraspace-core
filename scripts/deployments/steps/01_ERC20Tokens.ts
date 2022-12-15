import {deployAllERC20Tokens} from "../../../helpers/contracts-deployments";

export const step_01 = async (verify = false) => {
  try {
    return await deployAllERC20Tokens(verify);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
