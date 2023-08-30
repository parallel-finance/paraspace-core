import {
  deployAccount,
  deployAccountFactory,
  deployAccountRegistry,
  deployAccountRegistryProxy,
  deployInitializableImmutableAdminUpgradeabilityProxy,
} from "../../../helpers/contracts-deployments";
import {getFirstSigner} from "../../../helpers/contracts-getters";
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

      const accountRegistryProxy = await deployAccountRegistryProxy(
        paraSpaceConfig.ParaSpaceAdmin
          ? paraSpaceConfig.ParaSpaceAdmin
          : await (await getFirstSigner()).getAddress(),
        accountRegistry.address,
        verify
      );

      await deployAccountFactory(accountRegistryProxy.address, verify);
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
