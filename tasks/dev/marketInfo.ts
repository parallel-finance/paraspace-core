import {task} from "hardhat/config";
import minimatch from "minimatch";

task("market-info", "Print markets info")
  .addPositionalParam("market", "Market name/symbol pattern", "*")
  .setAction(async ({market}, DRE) => {
    await DRE.run("set-DRE");
    const {getPoolAddressesProvider, getUiPoolDataProvider} = await import(
      "../../helpers/contracts-getters"
    );
    const ui = await getUiPoolDataProvider();
    const provider = await getPoolAddressesProvider();
    const reservesData = (await ui.getReservesData(provider.address))[0];
    reservesData
      .filter(
        (r) =>
          !market || minimatch(r.name, market) || minimatch(r.symbol, market)
      )
      .forEach((x) => {
        console.log();
        console.log(x.symbol);
        console.log(" ltv:", x.baseLTVasCollateral.toString());
        console.log(
          " liquidationThreshold:",
          x.reserveLiquidationThreshold.toString()
        );
        console.log(" reserveFactor:", x.reserveFactor.toString());
        console.log(" xTokenAddress:", x.xTokenAddress);
        console.log(" variableDebtTokenAddress:", x.variableDebtTokenAddress);
        console.log(
          " interestRateStrategyAddress:",
          x.interestRateStrategyAddress
        );
        console.log(" auctionStrategyAddress:", x.auctionStrategyAddress);
      });
  });
