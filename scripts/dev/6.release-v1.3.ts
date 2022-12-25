import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployAutoCompoundApe,
  deployPoolComponents,
  deployTimeLockExecutor,
} from "../../helpers/contracts-deployments";
import {
  getParaSpaceOracle,
  getPoolAddressesProvider,
  getProtocolDataProvider,
} from "../../helpers/contracts-getters";
import {getParaSpaceAdmins} from "../../helpers/contracts-helpers";
import {GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {
  configureReservesByHelper,
  initReservesByHelper,
} from "../../helpers/init-helpers";
import {DRE, getParaSpaceConfig, waitForTx} from "../../helpers/misc-utils";
import {tEthereumAddress} from "../../helpers/types";
import {step_20} from "../deployments/steps/20_renounceOwnership";

const releaseV13 = async (verify = false) => {
  await DRE.run("set-DRE");
  console.time("release-v1.3");
  const addressesProvider = await getPoolAddressesProvider();
  const paraSpaceConfig = getParaSpaceConfig();
  const paraspaceOracle = await getParaSpaceOracle();
  const protocolDataProvider = await getProtocolDataProvider();

  try {
    console.time("deploy AutoCompoundApe");
    const cAPE = await deployAutoCompoundApe(false);
    console.timeEnd("deploy AutoCompoundApe");

    console.time("deploy PoolComponent");
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
    console.timeEnd("deploy PoolComponent");

    console.time("upgrade PoolCore");
    await waitForTx(
      await addressesProvider.updatePoolImpl(
        [
          {
            implAddress: poolCore.address,
            action: 1,
            functionSelectors: poolCoreSelectors,
          },
        ],
        ZERO_ADDRESS,
        "0x",
        GLOBAL_OVERRIDES
      )
    );
    console.timeEnd("upgrade PoolCore");

    console.time("upgrade PoolParameters");
    await waitForTx(
      await addressesProvider.updatePoolImpl(
        [
          {
            implAddress: poolParameters.address,
            action: 1,
            functionSelectors: poolParametersSelectors,
          },
        ],
        ZERO_ADDRESS,
        "0x",
        GLOBAL_OVERRIDES
      )
    );
    console.timeEnd("upgrade PoolParameters");

    console.time("upgrade PoolMarketplace");
    await waitForTx(
      await addressesProvider.updatePoolImpl(
        [
          {
            implAddress: poolMarketplace.address,
            action: 1,
            functionSelectors: poolMarketplaceSelectors,
          },
        ],
        ZERO_ADDRESS,
        "0x",
        GLOBAL_OVERRIDES
      )
    );
    console.timeEnd("upgrade PoolMarketplace");

    console.time("upgrade PoolApeStaking");
    await waitForTx(
      await addressesProvider.updatePoolImpl(
        [
          {
            implAddress: poolApeStaking.address,
            action: 1,
            functionSelectors: poolApeStakingSelectors,
          },
        ],
        ZERO_ADDRESS,
        "0x",
        GLOBAL_OVERRIDES
      )
    );
    console.timeEnd("upgrade PoolApeStaking");

    console.time("register ParaProxyInterfaces function selectors");
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
    console.timeEnd("register ParaProxyInterfaces function selectors");

    console.log("deploying cAPE aggregator...");
    const assets = [
      {
        symbol: "cAPE",
        address: cAPE.address,
        aggregator: "0xc7de7f4d4C9c991fF62a07D18b3E31e349833A18",
      },
    ];

    console.log("registering aggregators...");
    await waitForTx(
      await paraspaceOracle.setAssetSources(
        assets.map((x) => x.address),
        assets.map((x) => x.aggregator),
        GLOBAL_OVERRIDES
      )
    );

    const reservesParams = paraSpaceConfig.ReservesConfig;
    const allTokenAddresses = assets.reduce(
      (accum: {[name: string]: tEthereumAddress}, {symbol, address}) => ({
        ...accum,
        [symbol]: address,
      }),
      {}
    );
    const {PTokenNamePrefix, VariableDebtTokenNamePrefix, SymbolPrefix} =
      paraSpaceConfig;
    const {paraSpaceAdminAddress} = await getParaSpaceAdmins();
    const treasuryAddress = paraSpaceConfig.Treasury;

    console.log("initializing reserves...");
    await initReservesByHelper(
      reservesParams,
      allTokenAddresses,
      PTokenNamePrefix,
      VariableDebtTokenNamePrefix,
      SymbolPrefix,
      paraSpaceAdminAddress,
      treasuryAddress,
      ZERO_ADDRESS,
      verify
    );
    console.log("configuring reserves...");
    await configureReservesByHelper(
      reservesParams,
      allTokenAddresses,
      protocolDataProvider,
      paraSpaceAdminAddress
    );

    const timelock = await deployTimeLockExecutor(
      [
        "0xe965198731CDdB2f06e91DD0CDff74b71e4b3714",
        "3600",
        "86400",
        "300",
        "604800",
      ],
      false
    );

    console.log("renouncing ownership to timelock...");
    await step_20(verify, {
      paraSpaceAdminAddress: timelock.address,
      gatewayAdminAddress: timelock.address,
      riskAdminAddress: timelock.address,
    });

    console.timeEnd("release-v1.3");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseV13();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
