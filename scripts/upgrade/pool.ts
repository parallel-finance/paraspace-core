import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployPoolApeStaking,
  deployPoolBorrowAndStake,
  deployPoolComponents,
  deployPoolCore,
  deployPoolMarketplace,
  deployPoolParameters,
  deployPoolPositionMover,
} from "../../helpers/contracts-deployments";
import {
  getAllTokens,
  getPoolAddressesProvider,
  getPoolProxy,
} from "../../helpers/contracts-getters";
import {
  dryRunEncodedData,
  getContractAddressInDb,
} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {getParaSpaceConfig, waitForTx} from "../../helpers/misc-utils";
import {
  eContractid,
  ERC20TokenContractId,
  tEthereumAddress,
} from "../../helpers/types";
import {IParaProxy} from "../../types";
import {zeroAddress} from "ethereumjs-util";

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
    poolApeStaking,
    poolCoreSelectors: newPoolCoreSelectors,
    poolParametersSelectors: newPoolParametersSelectors,
    poolMarketplaceSelectors: newPoolMarketplaceSelectors,
    poolApeStakingSelectors: newPoolApeStakingSelectors,
  } = await deployPoolComponents(addressesProvider.address, verify);
  console.timeEnd("deploy PoolComponent");

  const implementations = [
    [poolCore.address, newPoolCoreSelectors, []],
    [poolMarketplace.address, newPoolMarketplaceSelectors, []],
    [poolParameters.address, newPoolParametersSelectors, []],
  ] as [string, string[], string[]][];

  if (poolApeStaking) {
    implementations.push([
      poolApeStaking.address,
      newPoolApeStakingSelectors,
      [],
    ]);
  }

  await upgradeProxyImplementations(implementations);
};

export const upgradePool = async (
  {
    oldPoolCore,
    oldPoolApeStaking,
    oldPoolMarketplace,
    oldPoolParameters,
  }: {
    oldPoolCore: tEthereumAddress;
    oldPoolMarketplace: tEthereumAddress;
    oldPoolApeStaking: tEthereumAddress;
    oldPoolParameters: tEthereumAddress;
  },
  verify = false
) => {
  const addressesProvider = await getPoolAddressesProvider();
  const pool = await getPoolProxy();
  console.time("deploy PoolComponent");
  const oldPoolCoreSelectors = await pool.facetFunctionSelectors(oldPoolCore);
  const oldPoolApeStakingSelectors = await pool.facetFunctionSelectors(
    oldPoolApeStaking
  );
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
    poolApeStaking,
    poolCoreSelectors: newPoolCoreSelectors,
    poolParametersSelectors: newPoolParametersSelectors,
    poolMarketplaceSelectors: newPoolMarketplaceSelectors,
    poolApeStakingSelectors: newPoolApeStakingSelectors,
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

  if (poolApeStaking) {
    implementations.push([
      poolApeStaking.address,
      newPoolApeStakingSelectors,
      oldPoolApeStakingSelectors,
    ]);
  }

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

export const upgradePoolApeStaking = async (
  oldPoolApeStaking: tEthereumAddress,
  verify = false
) => {
  const addressesProvider = await getPoolAddressesProvider();
  const pool = await getPoolProxy();
  const oldPoolApeStakingSelectors = await pool.facetFunctionSelectors(
    oldPoolApeStaking
  );

  const {poolApeStaking, poolApeStakingSelectors: newPoolApeStakingSelectors} =
    await deployPoolApeStaking(addressesProvider.address, verify);

  const implementations = [
    [
      poolApeStaking.address,
      newPoolApeStakingSelectors,
      oldPoolApeStakingSelectors,
    ],
  ] as [string, string[], string[]][];

  await upgradeProxyImplementations(implementations);
};

export const upgradeBorrowApeAndStake = async (
  oldPoolApeStaking: tEthereumAddress,
  verify = false
) => {
  const addressesProvider = await getPoolAddressesProvider();
  let oldPoolApeStakingSelectors: Array<string> = [];
  if (oldPoolApeStaking != zeroAddress()) {
    const pool = await getPoolProxy();
    oldPoolApeStakingSelectors = await pool.facetFunctionSelectors(
      oldPoolApeStaking
    );
  }

  const {
    poolBorrowAndStake,
    poolBorrowAndStakeSelectors: newPoolApeStakingSelectors,
  } = await deployPoolBorrowAndStake(addressesProvider.address, verify);

  const implementations = [
    [
      poolBorrowAndStake.address,
      newPoolApeStakingSelectors,
      oldPoolApeStakingSelectors,
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

export const upgradePoolPositionMover = async (
  oldPoolPositionMover: tEthereumAddress,
  verify = false
) => {
  const addressesProvider = await getPoolAddressesProvider();
  const pool = await getPoolProxy();
  const allTokens = await getAllTokens();
  const paraSpaceConfig = getParaSpaceConfig();
  const oldPoolPositionMoverSelectors = await pool.facetFunctionSelectors(
    oldPoolPositionMover
  );

  const bendDaoLendPoolLoan =
    paraSpaceConfig.BendDAO.LendingPoolLoan ||
    (await getContractAddressInDb(eContractid.MockBendDaoLendPool));
  const bendDaoLendPool =
    paraSpaceConfig.BendDAO.LendingPool ||
    (await getContractAddressInDb(eContractid.MockBendDaoLendPool));

  const {
    poolPositionMover,
    poolPositionMoverSelectors: newPoolPositionMoverSelectors,
  } = await deployPoolPositionMover(
    addressesProvider.address,
    bendDaoLendPoolLoan,
    bendDaoLendPool,
    paraSpaceConfig.ParaSpaceV1?.PoolV1 || ZERO_ADDRESS,
    paraSpaceConfig.ParaSpaceV1?.ProtocolDataProviderV1 || ZERO_ADDRESS,
    paraSpaceConfig.ParaSpaceV1?.CApeV1 || ZERO_ADDRESS,
    allTokens[ERC20TokenContractId.cAPE].address,
    allTokens[ERC20TokenContractId.APE].address,
    paraSpaceConfig.ParaSpaceV1?.TimeLockV1 || ZERO_ADDRESS,
    paraSpaceConfig.ParaSpaceV1?.P2PPairStakingV1 || ZERO_ADDRESS,
    verify
  );

  const implementations = [
    [
      poolPositionMover.address,
      newPoolPositionMoverSelectors,
      oldPoolPositionMoverSelectors,
    ],
  ] as [string, string[], string[]][];

  await upgradeProxyImplementations(implementations);
};
