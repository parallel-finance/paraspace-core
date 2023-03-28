import {BigNumberish} from "ethers";
import rawBRE from "hardhat";
import {
  getPoolAddressesProvider,
  getPoolConfiguratorProxy,
  getPoolProxy,
} from "../../helpers/contracts-getters";
import {GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {DRE, waitForTx} from "../../helpers/misc-utils";
import {DRY_RUN} from "../../helpers/hardhat-constants";
import {
  dryRunEncodedData,
  getEthersSigners,
} from "../../helpers/contracts-helpers";
import {getParaSpaceConfig} from "../../helpers/misc-utils";
import {tEthereumAddress} from "../../helpers/types";
import {
  deployATokenStableDebtToken,
  deployCApeStableDebtToken,
  deployGenericStableDebtToken,
  deployProtocolDataProvider,
  deployReserveInterestRateStrategy,
  deployStETHStableDebtToken,
} from "../../helpers/contracts-deployments";
import {resetPool} from "../upgrade/pool";
import {ONE_ADDRESS} from "../../helpers/constants";
import {upgradeConfigurator} from "../upgrade/configurator";

const updateETHInstantWithdraw = async () => {
  console.time("update eth instant withdraw");

  console.log("DRE.network.name:", DRE.network.name);

  const addressesProvider = await getPoolAddressesProvider();
  const poolConfiguratorProxy = await getPoolConfiguratorProxy(
    await addressesProvider.getPoolConfigurator()
  );
  const pool = await getPoolProxy();

  //1. pause pool
  if (DRY_RUN) {
    const encodedData =
      poolConfiguratorProxy.interface.encodeFunctionData("pausePool");
    await dryRunEncodedData(poolConfiguratorProxy.address, encodedData);
  } else {
    await waitForTx(await poolConfiguratorProxy.pausePool(GLOBAL_OVERRIDES));
  }

  //2. upgrade pool configurator
  await upgradeConfigurator(false);

  //3, update pool
  await resetPool(false);

  //4, update asset interest rate strategy and set stable debt token address
  const config = getParaSpaceConfig();
  const reservesParams = config.ReservesConfig;
  const assetAddresses = await pool.getReservesList();
  const MintableERC20 = await DRE.ethers.getContractFactory("MintableERC20");
  const strategyAddresses: Record<string, tEthereumAddress> = {};
  const assetAddressMap: Record<string, tEthereumAddress> = {};

  //4.1 deploy stable debt token implementation
  const genericStableDebtTokenImplementationAddress = (
    await deployGenericStableDebtToken(pool.address, false)
  ).address;
  const aTokenStableDebtTokenImplementationAddress = (
    await deployATokenStableDebtToken(pool.address, false)
  ).address;
  const stETHStableDebtTokenImplementationAddress = (
    await deployStETHStableDebtToken(pool.address, false)
  ).address;
  const cApeStableDebtTokenImplementationAddress = (
    await deployCApeStableDebtToken(pool.address, false)
  ).address;

  for (const assetAddress of assetAddresses) {
    let tokenSymbol;
    if (assetAddress === ONE_ADDRESS) {
      tokenSymbol = "sAPE";
    } else {
      const token = await MintableERC20.attach(assetAddress);
      const signers = await getEthersSigners();
      tokenSymbol = await token.connect(signers[2]).symbol();
    }
    console.log("tokenSymbol:", tokenSymbol);
    console.log("assetAddress:", assetAddress);

    let reserveIRStrategy;
    if (!reservesParams[tokenSymbol]) {
      reserveIRStrategy = reservesParams["sAPE"].strategy;
    } else {
      reserveIRStrategy = reservesParams[tokenSymbol].strategy;
    }
    assetAddressMap[tokenSymbol] = assetAddress;

    //4.2 deploy interest rate strategy
    if (!strategyAddresses[reserveIRStrategy.name]) {
      strategyAddresses[reserveIRStrategy.name] = (
        await deployReserveInterestRateStrategy(
          reserveIRStrategy.name,
          [
            addressesProvider.address,
            reserveIRStrategy.optimalUsageRatio,
            reserveIRStrategy.baseVariableBorrowRate,
            reserveIRStrategy.variableRateSlope1,
            reserveIRStrategy.variableRateSlope2,
            reserveIRStrategy.stableRateSlope1,
            reserveIRStrategy.stableRateSlope2,
            reserveIRStrategy.baseStableRateOffset,
            reserveIRStrategy.stableRateExcessOffset,
            reserveIRStrategy.optimalStableToTotalDebtRatio,
          ],
          false
        )
      ).address;
    }

    //4.3 update interest rate strategy
    if (DRY_RUN) {
      const encodedData = poolConfiguratorProxy.interface.encodeFunctionData(
        "setReserveInterestRateStrategyAddress",
        [assetAddress, strategyAddresses[reserveIRStrategy.name]]
      );
      await dryRunEncodedData(poolConfiguratorProxy.address, encodedData);
    } else {
      await waitForTx(
        await poolConfiguratorProxy.setReserveInterestRateStrategyAddress(
          assetAddress,
          strategyAddresses[reserveIRStrategy.name],
          GLOBAL_OVERRIDES
        )
      );
    }

    //4.4 update stable debt token address
    let stableDebtTokenImplementationAddress =
      genericStableDebtTokenImplementationAddress;
    if (tokenSymbol === "aWETH") {
      stableDebtTokenImplementationAddress =
        aTokenStableDebtTokenImplementationAddress;
    } else if (tokenSymbol === "stETH") {
      stableDebtTokenImplementationAddress =
        stETHStableDebtTokenImplementationAddress;
    } else if (tokenSymbol === "cAPE") {
      stableDebtTokenImplementationAddress =
        cApeStableDebtTokenImplementationAddress;
    }

    const configStableDebtTokenInput: {
      stableDebtTokenImpl: string;
      underlyingAsset: string;
      incentivesController: string;
      underlyingAssetDecimals: BigNumberish;
      stableDebtTokenName: string;
      stableDebtTokenSymbol: string;
      params: string;
    } = {
      stableDebtTokenImpl: stableDebtTokenImplementationAddress,
      underlyingAsset: assetAddress,
      incentivesController: config.IncentivesController,
      underlyingAssetDecimals: reservesParams[tokenSymbol].reserveDecimals,
      stableDebtTokenName: `${config.StableDebtTokenNamePrefix} ${config.SymbolPrefix}${tokenSymbol}`,
      stableDebtTokenSymbol: `sDebt${config.SymbolPrefix}${tokenSymbol}`,
      params: "0x10",
    };

    if (DRY_RUN) {
      const encodedData = poolConfiguratorProxy.interface.encodeFunctionData(
        "configReserveStableDebtTokenAddress",
        [configStableDebtTokenInput]
      );
      await dryRunEncodedData(poolConfiguratorProxy.address, encodedData);
    } else {
      await waitForTx(
        await poolConfiguratorProxy.configReserveStableDebtTokenAddress(
          configStableDebtTokenInput,
          GLOBAL_OVERRIDES
        )
      );
    }
  }

  //5 enable stable borrow for erc20 that needed
  const stableBorrowAsset = ["WETH", "aWETH", "stETH", "wstETH"];
  for (const symbol of stableBorrowAsset) {
    if (DRY_RUN) {
      const encodedData = poolConfiguratorProxy.interface.encodeFunctionData(
        "setReserveStableRateBorrowing",
        [assetAddressMap[symbol], true]
      );
      await dryRunEncodedData(poolConfiguratorProxy.address, encodedData);
    } else {
      await waitForTx(
        await poolConfiguratorProxy.setReserveStableRateBorrowing(
          assetAddressMap[symbol],
          true,
          GLOBAL_OVERRIDES
        )
      );
    }
  }

  //6. unpause pool
  if (DRY_RUN) {
    const encodedData =
      poolConfiguratorProxy.interface.encodeFunctionData("unpausePool");
    await dryRunEncodedData(poolConfiguratorProxy.address, encodedData);
  } else {
    await waitForTx(await poolConfiguratorProxy.unpausePool(GLOBAL_OVERRIDES));
  }

  // 7. upgrade protocol data provider
  console.log("upgrade protocol data provider");
  const protocolDataProvider = await deployProtocolDataProvider(
    addressesProvider.address,
    false
  );
  await addressesProvider.setProtocolDataProvider(
    protocolDataProvider.address,
    GLOBAL_OVERRIDES
  );
  console.log("upgrade protocol data provider done...");

  console.timeEnd("update eth instant withdraw");
};

async function main() {
  await rawBRE.run("set-DRE");
  await updateETHInstantWithdraw();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
