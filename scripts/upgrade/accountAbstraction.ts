import {Client} from "userop";
import {deployAccount} from "../../helpers/contracts-deployments";
import {getAccountRegistry} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {getParaSpaceConfig, waitForTx} from "../../helpers/misc-utils";

export const upgradeAccountAbstraction = async (verify = false) => {
  console.time("deploy AccountAbstraction");
  const paraSpaceConfig = getParaSpaceConfig();
  const client = Client.init(paraSpaceConfig.AccountAbstraction.rpcUrl);
  const accountRegistry = await getAccountRegistry();

  const account = await deployAccount(
    (
      await client
    ).entryPoint.address,
    verify
  );

  console.timeEnd("deploy AccountAbstraction");

  console.time("upgrade AccountAbstraction");
  if (DRY_RUN) {
    const encodedData = accountRegistry.interface.encodeFunctionData(
      "setLatestImplementation",
      [account.address]
    );
    await dryRunEncodedData(accountRegistry.address, encodedData);
  } else {
    await waitForTx(
      await accountRegistry.setLatestImplementation(
        account.address,
        GLOBAL_OVERRIDES
      )
    );
  }
  console.timeEnd("upgrade AccountAbstraction");
};
