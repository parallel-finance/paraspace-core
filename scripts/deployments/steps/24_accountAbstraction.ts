import {
  deployAccount,
  deployAccountFactory,
  deployAccountRegistry,
} from "../../../helpers/contracts-deployments";
import {getParaSpaceConfig, isLocalTestnet} from "../../../helpers/misc-utils";
import {Client} from "userop";

export const step_24 = async (verify = false) => {
  const paraSpaceConfig = getParaSpaceConfig();
  try {
    if (!isLocalTestnet()) {
      const client = Client.init(paraSpaceConfig.AccountAbstraction.rpcUrl);

      const account = await deployAccount(
        (
          await client
        ).entryPoint.address,
        verify
      );

      const accountRegistry = await deployAccountRegistry(
        account.address,
        verify
      );

      await deployAccountFactory(accountRegistry.address, verify);
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
