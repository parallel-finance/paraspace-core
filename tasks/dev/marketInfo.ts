import {task} from "hardhat/config";
import minimatch from "minimatch";
import {fromBn} from "evm-bn";
import {BigNumber} from "ethers";
import {WAD} from "../../helpers/constants";

task("market-info", "Print markets info")
  .addPositionalParam("market", "Market name/symbol pattern", "*")
  .addPositionalParam("blockHash", "block hash", undefined, undefined, true)
  .setAction(async ({market, blockHash}, DRE) => {
    await DRE.run("set-DRE");
    const {
      getPoolAddressesProvider,
      getUiPoolDataProvider,
      getParaSpaceOracle,
    } = await import("../../helpers/contracts-getters");
    const {getProxyImplementation} = await import(
      "../../helpers/contracts-helpers"
    );
    const ui = await getUiPoolDataProvider();
    const paraSpaceOracle = await getParaSpaceOracle();
    const provider = await getPoolAddressesProvider();
    const [reservesData, baseCurrencyInfo] = await ui.getReservesData(
      provider.address,
      {blockTag: blockHash}
    );
    for (const x of reservesData.filter(
      (r) =>
        !market ||
        minimatch(r.name, market) ||
        minimatch(r.symbol, market) ||
        r.assetType == market
    )) {
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
      console.log(" supplyCap:", x.supplyCap.toString());
      console.log(" borrowCap:", x.borrowCap.toString());
      console.log(" xTokenProxy:", x.xTokenAddress);
      console.log(
        " xTokenImpl:",
        await getProxyImplementation(x.xTokenAddress)
      );
      console.log(" variableDebtTokenProxy:", x.variableDebtTokenAddress);
      console.log(
        " variableDebtTokenImpl:",
        await getProxyImplementation(x.variableDebtTokenAddress)
      );
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
      console.log(
        " accruedToTreasury:",
        fromBn(
          x.accruedToTreasury.mul(WAD).div(BigNumber.from(10).pow(x.decimals))
        )
      );
      console.log(" liquidityIndex:", fromBn(x.liquidityIndex, 27));
      console.log(" liquidityRate:", fromBn(x.liquidityRate, 27));
      console.log(" variableBorrowRate:", fromBn(x.variableBorrowRate, 27));
      console.log(" variableBorrowIndex:", fromBn(x.variableBorrowIndex, 27));
      console.log(
        " oracle:",
        await paraSpaceOracle.getSourceOfAsset(x.underlyingAsset)
      );
    }
  });
