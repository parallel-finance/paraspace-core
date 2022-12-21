import {deployAllERC721Tokens} from "../../../helpers/contracts-deployments";

export const step_02 = async (verify = false) => {
  try {
    return await deployAllERC721Tokens(verify);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
