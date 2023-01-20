import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployAirdropFlashClaimReceiver,
  deployPoolCoreLibraries,
  deployUserFlashClaimRegistryProxy,
  getPoolSignatures,
} from "../../helpers/contracts-deployments";
import {
  getFirstSigner,
  getPoolAddressesProvider,
} from "../../helpers/contracts-getters";
import {
  dryRunEncodedData,
  getFunctionSignaturesFromDb,
  withSaveAndVerify,
} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";
import {eContractid} from "../../helpers/types";
import {IParaProxy, PoolCore, PoolCore__factory} from "../../types";

const releaseFlashClaim = async (verify = false) => {
  console.time("release-flashclaim");
  const deployer = await getFirstSigner();
  const deployerAddress = await deployer.getAddress();

  const addressesProvider = await getPoolAddressesProvider();
  const poolAddress = await addressesProvider.getPool();
  const receiverImpl = await deployAirdropFlashClaimReceiver(
    poolAddress,
    verify
  );

  await deployUserFlashClaimRegistryProxy(
    deployerAddress,
    receiverImpl.address,
    verify
  );

  const coreLibraries = await deployPoolCoreLibraries(verify);
  const oldPoolCoreSelectors = await getFunctionSignaturesFromDb(
    eContractid.PoolCoreImpl
  );
  const {poolCoreSelectors: newPoolCoreSelectors} = getPoolSignatures();
  const poolCore = (await withSaveAndVerify(
    new PoolCore__factory(coreLibraries, await getFirstSigner()),
    eContractid.PoolCoreImpl,
    [addressesProvider.address],
    verify,
    false,
    coreLibraries,
    newPoolCoreSelectors
  )) as PoolCore;
  const implementations: [string, string[], string[]][] = [
    [
      poolCore.address,
      newPoolCoreSelectors.map((s) => s.signature),
      oldPoolCoreSelectors,
    ],
  ];

  const [coreProxyImplementation] = implementations.map(
    ([implAddress, newSelectors, oldSelectors]) => {
      const toAdd = newSelectors.filter((s) => !oldSelectors.includes(s));
      const toReplace = newSelectors.filter((s) => oldSelectors.includes(s));
      const toRemove = oldSelectors.filter((s) => !newSelectors.includes(s));
      const proxyImplementation: IParaProxy.ProxyImplementationStruct[] = [];
      if (toRemove.length)
        proxyImplementation.push({
          implAddress: ZERO_ADDRESS,
          action: 2,
          functionSelectors: toRemove,
        });
      if (toReplace.length)
        proxyImplementation.push({
          implAddress,
          action: 1,
          functionSelectors: toReplace,
        });
      if (toAdd.length)
        proxyImplementation.push({
          implAddress,
          action: 0,
          functionSelectors: toAdd,
        });
      return proxyImplementation;
    }
  );
  console.log("coreProxyImplementation:", coreProxyImplementation);
  console.time("upgrade PoolCore");
  if (coreProxyImplementation) {
    if (DRY_RUN) {
      const encodedData = addressesProvider.interface.encodeFunctionData(
        "updatePoolImpl",
        [coreProxyImplementation, ZERO_ADDRESS, "0x"]
      );
      await dryRunEncodedData(addressesProvider.address, encodedData);
    } else {
      await waitForTx(
        await addressesProvider.updatePoolImpl(
          coreProxyImplementation,
          ZERO_ADDRESS,
          "0x",
          GLOBAL_OVERRIDES
        )
      );
    }
  }
  console.timeEnd("upgrade PoolCore");
  console.timeEnd("release-flashclaim");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseFlashClaim();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
