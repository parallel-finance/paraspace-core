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
import {GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {IParaProxy} from "../../types";

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

  const [
    coreProxyImplementation,
    marketplaceProxyImplementation,
    parametersProxyImplementation,
    apeStakingProxyImplementation,
    interfacesProxyImplementation,
  ] = (
    [
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
        poolApeStaking.address,
        newPoolApeStakingSelectors,
        oldPoolApeStakingSelectors,
      ],
      [
        poolParaProxyInterfaces.address,
        newPoolParaProxyInterfacesSelectors,
        oldPoolParaProxyInterfacesSelectors,
      ],
    ] as [string, string[], string[]][]
  ).map(([implAddress, newSelectors, oldSelectors]) => {
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

  console.time("upgrade PoolCore");
  await waitForTx(
    await addressesProvider.updatePoolImpl(
      coreProxyImplementation,
      ZERO_ADDRESS,
      "0x",
      GLOBAL_OVERRIDES
    )
  );
  console.timeEnd("upgrade PoolCore");

  console.time("upgrade PoolParameters");
  await waitForTx(
    await addressesProvider.updatePoolImpl(
      parametersProxyImplementation,
      ZERO_ADDRESS,
      "0x",
      GLOBAL_OVERRIDES
    )
  );
  console.timeEnd("upgrade PoolParameters");

  console.time("upgrade PoolMarketplace");
  await waitForTx(
    await addressesProvider.updatePoolImpl(
      marketplaceProxyImplementation,
      ZERO_ADDRESS,
      "0x",
      GLOBAL_OVERRIDES
    )
  );
  console.timeEnd("upgrade PoolMarketplace");

  console.time("upgrade PoolApeStaking");
  await waitForTx(
    await addressesProvider.updatePoolImpl(
      apeStakingProxyImplementation,
      ZERO_ADDRESS,
      "0x",
      GLOBAL_OVERRIDES
    )
  );
  console.timeEnd("upgrade PoolApeStaking");

  console.time("upgrade PoolParaProxyInterfaces");
  await waitForTx(
    await addressesProvider.updatePoolImpl(
      interfacesProxyImplementation,
      ZERO_ADDRESS,
      "0x",
      GLOBAL_OVERRIDES
    )
  );
  console.timeEnd("upgrade PoolParaProxyInterfaces");
};
