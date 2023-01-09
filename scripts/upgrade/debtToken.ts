import {getParaSpaceConfig, waitForTx} from "../../helpers/misc-utils";
import {deployGenericVariableDebtToken} from "../../helpers/contracts-deployments";
import {
  getPoolAddressesProvider,
  getPoolConfiguratorProxy,
  getUiPoolDataProvider,
  getVariableDebtToken,
} from "../../helpers/contracts-getters";

import dotenv from "dotenv";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {printEncodedData} from "../../helpers/contracts-helpers";

dotenv.config();

export const upgradeDebtToken = async (verify = false) => {
  const addressesProvider = await getPoolAddressesProvider();
  const paraSpaceConfig = getParaSpaceConfig();
  const poolAddress = await addressesProvider.getPool();
  const poolConfiguratorProxy = await getPoolConfiguratorProxy(
    await addressesProvider.getPoolConfigurator()
  );
  const uiPoolDataProvider = await getUiPoolDataProvider();
  const allReserves = (
    await uiPoolDataProvider.getReservesData(addressesProvider.address)
  )[0];
  let variableDebtTokenImplementationAddress = "";
  let newImpl = "";

  if (!variableDebtTokenImplementationAddress) {
    console.log("deploy VariableDebtToken implementation");
    variableDebtTokenImplementationAddress = (
      await deployGenericVariableDebtToken(poolAddress, verify)
    ).address;
  }
  newImpl = variableDebtTokenImplementationAddress;

  for (let i = 0; i < allReserves.length; i++) {
    const reserve = allReserves[i];
    const variableDebtToken = await getVariableDebtToken(
      reserve.variableDebtTokenAddress
    );
    const name = await variableDebtToken.name();
    const symbol = await variableDebtToken.symbol();
    const asset = await variableDebtToken.UNDERLYING_ASSET_ADDRESS();
    const incentivesController = paraSpaceConfig.IncentivesController;

    const oldRevision = (
      await variableDebtToken.DEBT_TOKEN_REVISION()
    ).toNumber();
    const newRevision = (
      await (await getVariableDebtToken(newImpl)).DEBT_TOKEN_REVISION()
    ).toNumber();

    if (oldRevision == newRevision) {
      continue;
    }

    console.log(
      `upgrading ${symbol}'s version from v${oldRevision} to v${newRevision}`
    );
    const updateInput = {
      asset: asset,
      incentivesController: incentivesController,
      name: name,
      symbol: symbol,
      implementation: newImpl,
      params: "0x10",
    };
    if (DRY_RUN) {
      const encodedData = poolConfiguratorProxy.interface.encodeFunctionData(
        "updateVariableDebtToken",
        [updateInput]
      );
      await printEncodedData(poolConfiguratorProxy.address, encodedData);
    } else {
      await waitForTx(
        await poolConfiguratorProxy.updateVariableDebtToken(
          updateInput,
          GLOBAL_OVERRIDES
        )
      );
    }
  }

  console.log("upgraded all debt token implementation.\n");
};
