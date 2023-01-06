import {ZERO_ADDRESS} from "../../../helpers/constants";
import {deployPoolComponents} from "../../../helpers/contracts-deployments";
import {
  getPoolProxy,
  getPoolAddressesProvider,
} from "../../../helpers/contracts-getters";
import {registerContractInDb} from "../../../helpers/contracts-helpers";
import {GLOBAL_OVERRIDES} from "../../../helpers/hardhat-constants";
import {waitForTx} from "../../../helpers/misc-utils";
import {eContractid} from "../../../helpers/types";

export const step_06 = async (verify = false) => {
  const addressesProvider = await getPoolAddressesProvider();

  try {
    const {
      poolCore,
      poolParameters,
      poolMarketplace,
      poolApeStaking,
      poolCoreSelectors,
      poolParaProxyInterfaces,
      poolParametersSelectors,
      poolMarketplaceSelectors,
      poolApeStakingSelectors,
      poolParaProxyInterfacesSelectors,
    } = await deployPoolComponents(addressesProvider.address, verify);

    await waitForTx(
      await addressesProvider.updatePoolImpl(
        [
          {
            implAddress: poolParameters.address,
            action: 0,
            functionSelectors: poolParametersSelectors,
          },
        ],
        ZERO_ADDRESS,
        "0x",
        GLOBAL_OVERRIDES
      )
    );

    await waitForTx(
      await addressesProvider.updatePoolImpl(
        [
          {
            implAddress: poolMarketplace.address,
            action: 0,
            functionSelectors: poolMarketplaceSelectors,
          },
        ],
        ZERO_ADDRESS,
        "0x",
        GLOBAL_OVERRIDES
      )
    );

    if (poolApeStaking) {
      await waitForTx(
        await addressesProvider.updatePoolImpl(
          [
            {
              implAddress: poolApeStaking.address,
              action: 0,
              functionSelectors: poolApeStakingSelectors,
            },
          ],
          ZERO_ADDRESS,
          "0x",
          GLOBAL_OVERRIDES
        )
      );
    }

    const poolAddress = await addressesProvider.getPool();

    await waitForTx(
      await addressesProvider.updatePoolImpl(
        [
          {
            implAddress: poolCore.address,
            action: 0,
            functionSelectors: poolCoreSelectors,
          },
        ],
        poolAddress,
        poolCore.interface.encodeFunctionData("initialize", [
          addressesProvider.address,
        ]),
        GLOBAL_OVERRIDES
      )
    );

    await waitForTx(
      await addressesProvider.updatePoolImpl(
        [
          {
            implAddress: poolParaProxyInterfaces.address,
            action: 0,
            functionSelectors: poolParaProxyInterfacesSelectors,
          },
        ],
        ZERO_ADDRESS,
        "0x",
        GLOBAL_OVERRIDES
      )
    );

    const poolProxy = await getPoolProxy(poolAddress);
    await registerContractInDb(eContractid.PoolProxy, poolProxy, [
      addressesProvider.address,
    ]);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
