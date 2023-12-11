import {deployAccountFactory} from "../../../helpers/contracts-deployments";
import {getParaSpaceConfig, isLocalTestnet} from "../../../helpers/misc-utils";
import {Client} from "userop";

export const step_24 = async (verify = false) => {
  const paraSpaceConfig = getParaSpaceConfig();
  try {
    if (!isLocalTestnet()) {
      const client = Client.init(paraSpaceConfig.AccountAbstraction.rpcUrl);

      const entryPoint = (await client).entryPoint.address;
      await deployAccountFactory(entryPoint, verify);
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
