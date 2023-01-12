import {waitForTx} from "../../helpers/misc-utils";
import {
  deployPoolComponents,
  getPoolSignaturesFromDb,
} from "../../helpers/contracts-deployments";
import {getPoolAddressesProvider} from "../../helpers/contracts-getters";
import dotenv from "dotenv";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {upgradePToken} from "./ptoken";
import {upgradeNToken} from "./ntoken";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {IParaProxy} from "../../types";
import {printEncodedData} from "../../helpers/contracts-helpers";

dotenv.config();

export const upgradeAll = async (verify = false) => {
  await upgradePool(verify);
  await upgradePToken(verify);
  await upgradeNToken(verify);
  console.log("upgrade all finished!");
};

export const upgradePool = async (verify = false) => {
  const addressesProvider = await getPoolAddressesProvider();
  console.time("deploy PoolComponent");
  const {
    poolCoreSelectors: oldPoolCoreSelectors,
    poolParametersSelectors: oldPoolParametersSelectors,
    poolMarketplaceSelectors: oldPoolMarketplaceSelectors,
    poolApeStakingSelectors: oldPoolApeStakingSelectors,
    poolParaProxyInterfacesSelectors: oldPoolParaProxyInterfacesSelectors,
  } = await getPoolSignaturesFromDb();

  const {
    poolCore,
    poolParameters,
    poolMarketplace,
    poolApeStaking,
    poolParaProxyInterfaces,
    poolCoreSelectors: newPoolCoreSelectors,
    poolParametersSelectors: newPoolParametersSelectors,
    poolMarketplaceSelectors: newPoolMarketplaceSelectors,
    poolApeStakingSelectors: newPoolApeStakingSelectors,
    poolParaProxyInterfacesSelectors: newPoolParaProxyInterfacesSelectors,
  } = await deployPoolComponents(addressesProvider.address, verify);
  console.timeEnd("deploy PoolComponent");

  const implementations = [
    [poolCore.address, newPoolCoreSelectors, oldPoolCoreSelectors],
    [
      poolMarketplace.address,
      newPoolMarketplaceSelectors,
      oldPoolMarketplaceSelectors,
    ],
    [
      poolParameters.address,
      newPoolParametersSelectors,
      oldPoolParametersSelectors,
    ],
    [
      poolParaProxyInterfaces.address,
      newPoolParaProxyInterfacesSelectors,
      oldPoolParaProxyInterfacesSelectors,
    ],
  ] as [string, string[], string[]][];

  if (poolApeStaking) {
    implementations.push([
      poolApeStaking.address,
      newPoolApeStakingSelectors,
      oldPoolApeStakingSelectors,
    ]);
  }

  const [
    coreProxyImplementation,
    marketplaceProxyImplementation,
    parametersProxyImplementation,
    interfacesProxyImplementation,
    apeStakingProxyImplementation,
  ] = implementations.map(([implAddress, newSelectors, oldSelectors]) => {
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
  });
  console.log("coreProxyImplementation:", coreProxyImplementation);
  console.log("parametersProxyImplementation:", parametersProxyImplementation);
  console.log(
    "marketplaceProxyImplementation:",
    marketplaceProxyImplementation
  );
  console.log("apeStakingProxyImplementation:", apeStakingProxyImplementation);
  console.log("interfacesProxyImplementation:", interfacesProxyImplementation);

  console.time("upgrade PoolCore");
  if (coreProxyImplementation) {
    if (DRY_RUN) {
      const encodedData = addressesProvider.interface.encodeFunctionData(
        "updatePoolImpl",
        [coreProxyImplementation, ZERO_ADDRESS, "0x"]
      );
      await printEncodedData(addressesProvider.address, encodedData);
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

  console.time("upgrade PoolParameters");
  if (parametersProxyImplementation) {
    if (DRY_RUN) {
      const encodedData = addressesProvider.interface.encodeFunctionData(
        "updatePoolImpl",
        [parametersProxyImplementation, ZERO_ADDRESS, "0x"]
      );
      await printEncodedData(addressesProvider.address, encodedData);
    } else {
      await waitForTx(
        await addressesProvider.updatePoolImpl(
          parametersProxyImplementation,
          ZERO_ADDRESS,
          "0x",
          GLOBAL_OVERRIDES
        )
      );
    }
  }
  console.timeEnd("upgrade PoolParameters");

  console.time("upgrade PoolMarketplace");
  if (marketplaceProxyImplementation) {
    if (DRY_RUN) {
      const encodedData = addressesProvider.interface.encodeFunctionData(
        "updatePoolImpl",
        [marketplaceProxyImplementation, ZERO_ADDRESS, "0x"]
      );
      await printEncodedData(addressesProvider.address, encodedData);
    } else {
      await waitForTx(
        await addressesProvider.updatePoolImpl(
          marketplaceProxyImplementation,
          ZERO_ADDRESS,
          "0x",
          GLOBAL_OVERRIDES
        )
      );
    }
  }
  console.timeEnd("upgrade PoolMarketplace");

  console.time("upgrade PoolApeStaking");
  if (apeStakingProxyImplementation) {
    if (DRY_RUN) {
      const encodedData = addressesProvider.interface.encodeFunctionData(
        "updatePoolImpl",
        [apeStakingProxyImplementation, ZERO_ADDRESS, "0x"]
      );
      await printEncodedData(addressesProvider.address, encodedData);
    } else {
      await waitForTx(
        await addressesProvider.updatePoolImpl(
          apeStakingProxyImplementation,
          ZERO_ADDRESS,
          "0x",
          GLOBAL_OVERRIDES
        )
      );
    }
  }
  console.timeEnd("upgrade PoolApeStaking");

  console.time("upgrade PoolParaProxyInterfaces");
  if (interfacesProxyImplementation) {
    if (DRY_RUN) {
      const encodedData = addressesProvider.interface.encodeFunctionData(
        "updatePoolImpl",
        [interfacesProxyImplementation, ZERO_ADDRESS, "0x"]
      );
      await printEncodedData(addressesProvider.address, encodedData);
    } else {
      await waitForTx(
        await addressesProvider.updatePoolImpl(
          interfacesProxyImplementation,
          ZERO_ADDRESS,
          "0x",
          GLOBAL_OVERRIDES
        )
      );
    }
  }
  console.timeEnd("upgrade PoolParaProxyInterfaces");
};
