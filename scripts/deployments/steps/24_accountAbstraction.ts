import {ZERO_ADDRESS} from "../../../helpers/constants";
import {deployAccountFactory} from "../../../helpers/contracts-deployments";
import {getParaSpaceConfig, isLocalTestnet} from "../../../helpers/misc-utils";
import {Client} from "userop";

export const step_24 = async (verify = false) => {
  const paraSpaceConfig = getParaSpaceConfig();
  try {
    if (!isLocalTestnet()) {
      await deployAccountFactory(
        paraSpaceConfig.AccountAbstraction?.rpcUrl
          ? (
              await Client.init(paraSpaceConfig.AccountAbstraction.rpcUrl)
            ).entryPoint.address
          : ZERO_ADDRESS,
        verify
      );
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
