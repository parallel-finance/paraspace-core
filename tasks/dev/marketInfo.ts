import {task} from "hardhat/config";
import minimatch from "minimatch";
import {fromBn} from "evm-bn";

task("market-info", "Print markets info")
  .addPositionalParam("market", "Market name/symbol pattern", "*")
  .setAction(async ({market}, DRE) => {
    await DRE.run("set-DRE");
    const {
      getPoolAddressesProvider,
      getProtocolDataProvider,
      getUiPoolDataProvider,
    } = await import("../../helpers/contracts-getters");
    const ui = await getUiPoolDataProvider();
    const protocolDataProvider = await getProtocolDataProvider();
    const provider = await getPoolAddressesProvider();
    const [reservesData, baseCurrencyInfo] = await ui.getReservesData(
      provider.address
    );
    for (const x of reservesData.filter(
      (r) => !market || minimatch(r.name, market) || minimatch(r.symbol, market)
    )) {
      const {supplyCap, borrowCap} = await protocolDataProvider.getReserveCaps(
        x.underlyingAsset
      );
      console.log();
      console.log(x.symbol);
      console.log(" asset:", x.underlyingAsset);
      console.log(" ltv:", x.baseLTVasCollateral.toString());
      console.log(
        " liquidationThreshold:",
        x.reserveLiquidationThreshold.toString()
      );
      console.log(" liquidationBonus", x.reserveLiquidationBonus.toString());
      console.log(" reserveFactor:", x.reserveFactor.toString());
      console.log(" supplyCap:", supplyCap.toString());
      console.log(" borrowCap:", borrowCap.toString());
      console.log(" xTokenAddress:", x.xTokenAddress);
      console.log(" variableDebtTokenAddress:", x.variableDebtTokenAddress);
      console.log(
        " interestRateStrategyAddress:",
        x.interestRateStrategyAddress
      );
      console.log(" auctionStrategyAddress:", x.auctionStrategyAddress);
      console.log(" price:", fromBn(x.priceInMarketReferenceCurrency));
      console.log(
        " price($):",
        fromBn(
          x.priceInMarketReferenceCurrency
            .mul(baseCurrencyInfo.networkBaseTokenPriceInUsd)
            .div(10 ** baseCurrencyInfo.networkBaseTokenPriceDecimals)
        )
      );
    }
  });
