import {task} from "hardhat/config";
import {DRY_RUN} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

task("set-ltv", "Set LTV")
  .addPositionalParam("asset", "asset")
  .addPositionalParam("ltv", "ltv")
  .setAction(async ({asset, ltv}, DRE) => {
    await DRE.run("set-DRE");
    const {printEncodedData} = await import("../../helpers/contracts-helpers");
    const {
      getPoolConfiguratorProxy,
      getPoolAddressesProvider,
      getUiPoolDataProvider,
    } = await import("../../helpers/contracts-getters");
    const ui = await getUiPoolDataProvider();
    const provider = await getPoolAddressesProvider();
    const configurator = await getPoolConfiguratorProxy();
    const [reservesData] = await ui.getReservesData(provider.address);

    const reserveData = reservesData.find((x) => x.underlyingAsset === asset);
    if (!reserveData) {
      return;
    }

    const encodedData = configurator.interface.encodeFunctionData(
      "configureReserveAsCollateral",
      [
        reserveData.underlyingAsset,
        ltv,
        reserveData.reserveLiquidationThreshold,
        reserveData.reserveLiquidationBonus,
      ]
    );
    if (DRY_RUN) {
      await printEncodedData(configurator.address, encodedData);
    } else {
      await waitForTx(
        await configurator.configureReserveAsCollateral(
          reserveData.underlyingAsset,
          ltv,
          reserveData.reserveLiquidationThreshold,
          reserveData.reserveLiquidationBonus
        )
      );
    }
  });

task("set-liquidation-threshold", "Set liquidation threshold")
  .addPositionalParam("asset", "asset")
  .addPositionalParam("liquidationThreshold", "liquidation threshold")
  .setAction(async ({asset, liquidationThreshold}, DRE) => {
    await DRE.run("set-DRE");
    const {printEncodedData} = await import("../../helpers/contracts-helpers");
    const {
      getPoolConfiguratorProxy,
      getPoolAddressesProvider,
      getUiPoolDataProvider,
    } = await import("../../helpers/contracts-getters");
    const ui = await getUiPoolDataProvider();
    const provider = await getPoolAddressesProvider();
    const configurator = await getPoolConfiguratorProxy();
    const [reservesData] = await ui.getReservesData(provider.address);

    const reserveData = reservesData.find((x) => x.underlyingAsset === asset);
    if (!reserveData) {
      return;
    }

    const encodedData = configurator.interface.encodeFunctionData(
      "configureReserveAsCollateral",
      [
        reserveData.underlyingAsset,
        reserveData.baseLTVasCollateral,
        liquidationThreshold,
        reserveData.reserveLiquidationBonus,
      ]
    );
    if (DRY_RUN) {
      await printEncodedData(configurator.address, encodedData);
    } else {
      await waitForTx(
        await configurator.configureReserveAsCollateral(
          reserveData.underlyingAsset,
          reserveData.baseLTVasCollateral,
          liquidationThreshold,
          reserveData.reserveLiquidationBonus
        )
      );
    }
  });

task("set-reserve-factor", "Set reserve factor")
  .addPositionalParam("asset", "asset")
  .addPositionalParam("reserveFactor", "reserve factor")
  .setAction(async ({asset, reserveFactor}, DRE) => {
    await DRE.run("set-DRE");
    const {printEncodedData} = await import("../../helpers/contracts-helpers");
    const {
      getPoolConfiguratorProxy,
      getPoolAddressesProvider,
      getUiPoolDataProvider,
    } = await import("../../helpers/contracts-getters");
    const ui = await getUiPoolDataProvider();
    const provider = await getPoolAddressesProvider();
    const configurator = await getPoolConfiguratorProxy();
    const [reservesData] = await ui.getReservesData(provider.address);

    const reserveData = reservesData.find((x) => x.underlyingAsset === asset);
    if (!reserveData) {
      return;
    }

    const encodedData = configurator.interface.encodeFunctionData(
      "setReserveFactor",
      [reserveData.underlyingAsset, reserveFactor]
    );
    if (DRY_RUN) {
      await printEncodedData(configurator.address, encodedData);
    } else {
      await waitForTx(
        await configurator.setReserveFactor(
          reserveData.underlyingAsset,
          reserveFactor
        )
      );
    }
  });

task("set-interest-rate-strategy", "Set interest rate strategy")
  .addPositionalParam("asset", "asset")
  .addPositionalParam(
    "interestRateStrategyAddress",
    "interest rate strategy address"
  )
  .setAction(async ({asset, interestRateStrategyAddress}, DRE) => {
    await DRE.run("set-DRE");
    const {printEncodedData} = await import("../../helpers/contracts-helpers");
    const {
      getPoolConfiguratorProxy,
      getPoolAddressesProvider,
      getUiPoolDataProvider,
    } = await import("../../helpers/contracts-getters");
    const ui = await getUiPoolDataProvider();
    const provider = await getPoolAddressesProvider();
    const configurator = await getPoolConfiguratorProxy();
    const [reservesData] = await ui.getReservesData(provider.address);

    const reserveData = reservesData.find((x) => x.underlyingAsset === asset);
    if (!reserveData) {
      return;
    }

    const encodedData = configurator.interface.encodeFunctionData(
      "setReserveInterestRateStrategyAddress",
      [reserveData.underlyingAsset, interestRateStrategyAddress]
    );
    if (DRY_RUN) {
      await printEncodedData(configurator.address, encodedData);
    } else {
      await waitForTx(
        await configurator.setReserveInterestRateStrategyAddress(
          reserveData.underlyingAsset,
          interestRateStrategyAddress
        )
      );
    }
  });

task("set-auction-strategy", "Set auction strategy")
  .addPositionalParam("asset", "asset")
  .addPositionalParam("auctionStrategyAddress", "auction strategy address")
  .setAction(async ({asset, auctionStrategyAddress}, DRE) => {
    await DRE.run("set-DRE");
    const {printEncodedData} = await import("../../helpers/contracts-helpers");
    const {
      getPoolConfiguratorProxy,
      getPoolAddressesProvider,
      getUiPoolDataProvider,
    } = await import("../../helpers/contracts-getters");
    const ui = await getUiPoolDataProvider();
    const provider = await getPoolAddressesProvider();
    const configurator = await getPoolConfiguratorProxy();
    const [reservesData] = await ui.getReservesData(provider.address);

    const reserveData = reservesData.find((x) => x.underlyingAsset === asset);
    if (!reserveData) {
      return;
    }

    const encodedData = configurator.interface.encodeFunctionData(
      "setReserveAuctionStrategyAddress",
      [reserveData.underlyingAsset, auctionStrategyAddress]
    );
    if (DRY_RUN) {
      await printEncodedData(configurator.address, encodedData);
    } else {
      await waitForTx(
        await configurator.setReserveAuctionStrategyAddress(
          reserveData.underlyingAsset,
          auctionStrategyAddress
        )
      );
    }
  });

task("set-supply-cap", "Set supply cap")
  .addPositionalParam("asset", "asset")
  .addPositionalParam("supplyCap", "new supply cap")
  .setAction(async ({asset, supplyCap}, DRE) => {
    await DRE.run("set-DRE");
    const {printEncodedData} = await import("../../helpers/contracts-helpers");
    const {
      getPoolConfiguratorProxy,
      getPoolAddressesProvider,
      getUiPoolDataProvider,
    } = await import("../../helpers/contracts-getters");
    const ui = await getUiPoolDataProvider();
    const provider = await getPoolAddressesProvider();
    const configurator = await getPoolConfiguratorProxy();
    const [reservesData] = await ui.getReservesData(provider.address);

    const reserveData = reservesData.find((x) => x.underlyingAsset === asset);
    if (!reserveData) {
      return;
    }

    const encodedData = configurator.interface.encodeFunctionData(
      "setSupplyCap",
      [reserveData.underlyingAsset, supplyCap]
    );
    if (DRY_RUN) {
      await printEncodedData(configurator.address, encodedData);
    } else {
      await waitForTx(
        await configurator.setSupplyCap(reserveData.underlyingAsset, supplyCap)
      );
    }
  });

task("set-borrow-cap", "Set borrow cap")
  .addPositionalParam("asset", "asset")
  .addPositionalParam("borrowCap", "new borrow cap")
  .setAction(async ({asset, borrowCap}, DRE) => {
    await DRE.run("set-DRE");
    const {printEncodedData} = await import("../../helpers/contracts-helpers");
    const {
      getPoolConfiguratorProxy,
      getPoolAddressesProvider,
      getUiPoolDataProvider,
    } = await import("../../helpers/contracts-getters");
    const ui = await getUiPoolDataProvider();
    const provider = await getPoolAddressesProvider();
    const configurator = await getPoolConfiguratorProxy();
    const [reservesData] = await ui.getReservesData(provider.address);

    const reserveData = reservesData.find((x) => x.underlyingAsset === asset);
    if (!reserveData) {
      return;
    }

    const encodedData = configurator.interface.encodeFunctionData(
      "setBorrowCap",
      [reserveData.underlyingAsset, borrowCap]
    );
    if (DRY_RUN) {
      await printEncodedData(configurator.address, encodedData);
    } else {
      await waitForTx(
        await configurator.setBorrowCap(reserveData.underlyingAsset, borrowCap)
      );
    }
  });
