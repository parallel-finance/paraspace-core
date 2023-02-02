import {deployP2PPairStaking} from "../../../helpers/contracts-deployments";

export const step_20 = async (verify = false) => {
  try {
    // deploy P2PPairStaking
    await deployP2PPairStaking(verify);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
