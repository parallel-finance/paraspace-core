import rawBRE from "hardhat";
import {
  deployPoolCoreLibraries,
  deployStakefishNTokenImpl,
  getPoolSignatures,
} from "../../helpers/contracts-deployments";
import {
  getFirstSigner,
  getNToken,
  getPoolAddressesProvider,
  getPoolConfiguratorProxy,
  getPoolProxy,
} from "../../helpers/contracts-getters";
import {
  dryRunEncodedData,
  getContractAddressInDb,
  withSaveAndVerify,
} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {getParaSpaceConfig, waitForTx} from "../../helpers/misc-utils";
import {eContractid} from "../../helpers/types";
import {PoolCore, PoolCore__factory} from "../../types";
import {upgradeProxyImplementations} from "../upgrade/pool";

const adHoc = async () => {
  console.time("ad-hoc");
  const paraSpaceConfig = getParaSpaceConfig();
  const addressesProvider = await getPoolAddressesProvider();
  const poolConfiguratorProxy = await getPoolConfiguratorProxy(
    await addressesProvider.getPoolConfigurator()
  );
  const nToken = await getNToken("0x0719E8D6acBDCECD1B6A4F32Cc7367c8969Ae352");
  const asset = await nToken.UNDERLYING_ASSET_ADDRESS();
  const incentivesController = paraSpaceConfig.IncentivesController;
  const name = await nToken.name();
  const symbol = await nToken.symbol();

  const poolAddress = await addressesProvider.getPool();
  const delegationRegistry = paraSpaceConfig.DelegationRegistry;

  const newImpl = (
    await deployStakefishNTokenImpl(poolAddress, delegationRegistry, false)
  ).address;

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
      "updateNToken",
      [updateInput]
    );
    await dryRunEncodedData(poolConfiguratorProxy.address, encodedData);
  } else {
    await waitForTx(
      await poolConfiguratorProxy.updateNToken(updateInput, GLOBAL_OVERRIDES)
    );
  }

  const coreLibraries = await deployPoolCoreLibraries(false);

  const {poolCoreSelectors} = getPoolSignatures();

  const poolCore = (await withSaveAndVerify(
    new PoolCore__factory(coreLibraries, await getFirstSigner()),
    eContractid.PoolCoreImpl,
    [
      addressesProvider.address,
      await getContractAddressInDb(eContractid.TimeLockProxy),
    ],
    false,
    false,
    coreLibraries,
    poolCoreSelectors
  )) as PoolCore;

  const pool = await getPoolProxy();
  const oldPoolCoreSelectors = await pool.facetFunctionSelectors(
    "0x8e1f8B5c9ae49a9B13084c4BD071efC03a7c3Da8"
  );

  const implementations = [
    [
      poolCore.address,
      poolCoreSelectors.map((s) => s.signature),
      oldPoolCoreSelectors,
    ],
  ] as [string, string[], string[]][];

  await upgradeProxyImplementations(implementations);
  console.timeEnd("ad-hoc");
};

async function main() {
  await rawBRE.run("set-DRE");
  await adHoc();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
