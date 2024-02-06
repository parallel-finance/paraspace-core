import {deployAccountFactory} from "../../../helpers/contracts-deployments";
import {isLocalTestnet} from "../../../helpers/misc-utils";
import {zeroAddress} from "ethereumjs-util";

export const step_24 = async (verify = false) => {
  try {
    if (!isLocalTestnet()) {
      // const client = Client.init(paraSpaceConfig.AccountAbstraction.rpcUrl);
      //
      // const entryPoint = (await client).entryPoint.address;
      await deployAccountFactory(zeroAddress(), verify);
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
