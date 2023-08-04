import rawBRE from "hardhat";
import {deployAggregator} from "../../helpers/contracts-deployments";
import {
  getAllTokens,
  getParaSpaceOracle,
  getPoolAddressesProvider,
  getPoolConfiguratorProxy,
} from "../../helpers/contracts-getters";
import {initAndConfigureReserves} from "../../helpers/contracts-helpers";
import {GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {getParaSpaceConfig, waitForTx} from "../../helpers/misc-utils";
import {ERC20TokenContractId} from "../../helpers/types";
import {step_13} from "../deployments/steps/13_wethGateway";
import {upgradeTimeLock} from "../upgrade/timeLock";

const redeployMarket = async (verify = false) => {
  console.time("redeploy-market");
  const allTokens = await getAllTokens();
  const configurator = await getPoolConfiguratorProxy();
  const symbol = ERC20TokenContractId.WETH;
  await waitForTx(await configurator.dropReserve(allTokens[symbol].address));
  // deploy new Token
  const provider = await getPoolAddressesProvider();
  const oracle = await getParaSpaceOracle();
  const config = getParaSpaceConfig();
  const token = (await getAllTokens())[symbol];
  const isWrappedNativeToken = symbol == config.WrappedNativeTokenId;
  if (isWrappedNativeToken) {
    await waitForTx(await provider.setWETH(token.address));
    await upgradeTimeLock(verify);
    await step_13(verify);
  }
  const aggregator = await deployAggregator(
    symbol,
    config?.Mocks?.AllAssetsInitialPrices[symbol]!,
    verify
  );
  await waitForTx(
    await oracle.setAssetSources(
      [token.address],
      [aggregator.address],
      GLOBAL_OVERRIDES
    )
  );
  await initAndConfigureReserves([
    {
      symbol,
      address: token.address,
      aggregator: aggregator.address,
    },
  ]);
  console.timeEnd("redeploy-market");
};

async function main() {
  await rawBRE.run("set-DRE");
  await redeployMarket();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
