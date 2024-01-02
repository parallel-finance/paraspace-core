import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployPoolComponents,
  deployPoolCore,
  deployPoolMarketplace,
  deployPoolParameters,
  deployAAPoolPositionMover,
} from "../../helpers/contracts-deployments";
import {
  getPoolAddressesProvider,
  getPoolProxy,
} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";
import {tEthereumAddress} from "../../helpers/types";
import {IParaProxy} from "../../types";

export const upgradeProxyImplementations = async (
  implementations: [string, string[], string[]][]
) => {
  const addressesProvider = await getPoolAddressesProvider();

  const proxyImplementations = implementations.map(
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

  console.log(
    "proxyImplementations:",
    JSON.stringify(proxyImplementations, null, 4)
  );

  if (DRY_RUN) {
    const encodedData = addressesProvider.interface.encodeFunctionData(
      "updatePoolImpl",
      [proxyImplementations.flat(), ZERO_ADDRESS, "0x"]
    );
    await dryRunEncodedData(addressesProvider.address, encodedData);
  } else {
    await waitForTx(
      await addressesProvider.updatePoolImpl(
        proxyImplementations.flat(),
        ZERO_ADDRESS,
        "0x",
        GLOBAL_OVERRIDES
      )
    );
  }
};

const resetSelectors = async () => {
  const implementations: IParaProxy.ProxyImplementationStruct[] = [];
  const addressesProvider = await getPoolAddressesProvider();
  const pool = await getPoolProxy();
  const facets = await pool.facets();
  const paraProxyInterfacesImpl = await pool.facetAddress("0x7a0ed627");

  for (const facet of facets.filter(
    (x) => x.implAddress !== paraProxyInterfacesImpl
  )) {
    implementations.push({
      implAddress: ZERO_ADDRESS,
      action: 2,
      functionSelectors: facet.functionSelectors,
    });
  }

  if (DRY_RUN) {
    const encodedData = addressesProvider.interface.encodeFunctionData(
      "updatePoolImpl",
      [implementations, ZERO_ADDRESS, "0x"]
    );
    await dryRunEncodedData(addressesProvider.address, encodedData);
  } else {
    await waitForTx(
      await addressesProvider.updatePoolImpl(
        implementations,
        ZERO_ADDRESS,
        "0x",
        GLOBAL_OVERRIDES
      )
    );
  }
};

export const resetPool = async (verify = false) => {
  const addressesProvider = await getPoolAddressesProvider();

  await resetSelectors();

  console.time("deploy PoolComponent");
  const {
    poolCore,
    poolParameters,
    poolMarketplace,
    poolCoreSelectors: newPoolCoreSelectors,
    poolParametersSelectors: newPoolParametersSelectors,
    poolMarketplaceSelectors: newPoolMarketplaceSelectors,
  } = await deployPoolComponents(addressesProvider.address, verify);
  console.timeEnd("deploy PoolComponent");

  const implementations = [
    [poolCore.address, newPoolCoreSelectors, []],
    [poolMarketplace.address, newPoolMarketplaceSelectors, []],
    [poolParameters.address, newPoolParametersSelectors, []],
  ] as [string, string[], string[]][];

  await upgradeProxyImplementations(implementations);
};

export const upgradePool = async (
  {
    oldPoolCore,
    oldPoolMarketplace,
    oldPoolParameters,
  }: {
    oldPoolCore: tEthereumAddress;
    oldPoolMarketplace: tEthereumAddress;
    oldPoolParameters: tEthereumAddress;
  },
  verify = false
) => {
  const addressesProvider = await getPoolAddressesProvider();
  const pool = await getPoolProxy();
  console.time("deploy PoolComponent");
  const oldPoolCoreSelectors = await pool.facetFunctionSelectors(oldPoolCore);
  const oldPoolMarketplaceSelectors = await pool.facetFunctionSelectors(
    oldPoolMarketplace
  );
  const oldPoolParametersSelectors = await pool.facetFunctionSelectors(
    oldPoolParameters
  );

  const {
    poolCore,
    poolParameters,
    poolMarketplace,
    poolCoreSelectors: newPoolCoreSelectors,
    poolParametersSelectors: newPoolParametersSelectors,
    poolMarketplaceSelectors: newPoolMarketplaceSelectors,
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
  ] as [string, string[], string[]][];

  await upgradeProxyImplementations(implementations);
};

export const upgradePoolCore = async (
  oldPoolCore: tEthereumAddress,
  verify = false
) => {
  const addressesProvider = await getPoolAddressesProvider();
  const pool = await getPoolProxy();
  const oldPoolCoreSelectors = await pool.facetFunctionSelectors(oldPoolCore);

  const {poolCore, poolCoreSelectors: newPoolCoreSelectors} =
    await deployPoolCore(addressesProvider.address, verify);

  const implementations = [
    [poolCore.address, newPoolCoreSelectors, oldPoolCoreSelectors],
  ] as [string, string[], string[]][];

  await upgradeProxyImplementations(implementations);
};

export const upgradePoolMarketplace = async (
  oldPoolMarketplace: tEthereumAddress,
  verify = false
) => {
  const addressesProvider = await getPoolAddressesProvider();
  const pool = await getPoolProxy();
  const oldPoolMarketplaceSelectors = await pool.facetFunctionSelectors(
    oldPoolMarketplace
  );

  const {
    poolMarketplace,
    poolMarketplaceSelectors: newPoolMarketplaceSelectors,
  } = await deployPoolMarketplace(addressesProvider.address, verify);

  const implementations = [
    [
      poolMarketplace.address,
      newPoolMarketplaceSelectors,
      oldPoolMarketplaceSelectors,
    ],
  ] as [string, string[], string[]][];

  await upgradeProxyImplementations(implementations);
};

export const upgradePoolParameters = async (
  oldPoolParameters: tEthereumAddress,
  verify = false
) => {
  const addressesProvider = await getPoolAddressesProvider();
  const pool = await getPoolProxy();
  const oldPoolParametersSelectors = await pool.facetFunctionSelectors(
    oldPoolParameters
  );

  const {poolParameters, poolParametersSelectors: newPoolParametersSelectors} =
    await deployPoolParameters(addressesProvider.address, verify);

  const implementations = [
    [
      poolParameters.address,
      newPoolParametersSelectors,
      oldPoolParametersSelectors,
    ],
  ] as [string, string[], string[]][];

  await upgradeProxyImplementations(implementations);
};

export const upgradePoolAAPositionMover = async (
  oldAAPoolPositionMover: tEthereumAddress,
  verify = false
) => {
  const pool = await getPoolProxy();
  const oldPoolPositionMoverSelectors = await pool.facetFunctionSelectors(
    oldAAPoolPositionMover
  );

  const {
    poolAAPositionMover,
    poolAAPositionMoverSelectors: newPoolPositionMoverSelectors,
  } = await deployAAPoolPositionMover(verify);

  const implementations = [
    [
      poolAAPositionMover.address,
      newPoolPositionMoverSelectors,
      oldPoolPositionMoverSelectors,
    ],
  ] as [string, string[], string[]][];

  await upgradeProxyImplementations(implementations);
};
