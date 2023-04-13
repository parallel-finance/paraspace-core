import {ZERO_ADDRESS} from "../../../helpers/constants";
import {
  deployPoolComponents,
  deployPoolParaProxyInterfaces,
} from "../../../helpers/contracts-deployments";
import {
  getPoolProxy,
  getPoolAddressesProvider,
  getAutoCompoundApe,
  getAllTokens,
  getUniswapV3SwapRouter,
} from "../../../helpers/contracts-getters";
import {registerContractInDb} from "../../../helpers/contracts-helpers";
import {GLOBAL_OVERRIDES} from "../../../helpers/hardhat-constants";
import {waitForTx} from "../../../helpers/misc-utils";
import {eContractid, ERC20TokenContractId} from "../../../helpers/types";

export const step_06 = async (verify = false) => {
  const addressesProvider = await getPoolAddressesProvider();

  try {
    const {
      poolCore,
      poolParameters,
      poolMarketplace,
      poolApeStaking,
      poolPositionMover,
      poolCoreSelectors,
      poolParametersSelectors,
      poolMarketplaceSelectors,
      poolApeStakingSelectors,
      poolPositionMoverSelectors,
    } = await deployPoolComponents(addressesProvider.address, verify);

    const {poolParaProxyInterfaces, poolParaProxyInterfacesSelectors} =
      await deployPoolParaProxyInterfaces(verify);

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

    await waitForTx(
      await addressesProvider.updatePoolImpl(
        [
          {
            implAddress: poolPositionMover.address,
            action: 0,
            functionSelectors: poolPositionMoverSelectors,
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
    const cAPE = await getAutoCompoundApe();
    const uniswapV3Router = await getUniswapV3SwapRouter();
    const allTokens = await getAllTokens();

    if (allTokens[ERC20TokenContractId.APE]) {
      await waitForTx(
        await poolProxy.unlimitedApproveTo(
          allTokens[ERC20TokenContractId.APE].address,
          uniswapV3Router.address
        )
      );
      await waitForTx(
        await poolProxy.unlimitedApproveTo(
          allTokens[ERC20TokenContractId.APE].address,
          cAPE.address
        )
      );
    }

    await registerContractInDb(eContractid.PoolProxy, poolProxy, [
      addressesProvider.address,
    ]);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
