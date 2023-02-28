import {parseEther} from "ethers/lib/utils";
import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployAggregator,
  deployBaseCurrencySynchronicityPriceAdapter,
  deployCLwstETHSynchronicityPriceAdapter,
  deployExchangeRateSynchronicityPriceAdapter,
} from "../../helpers/contracts-deployments";
import {
  getParaSpaceOracle,
  getProtocolDataProvider,
} from "../../helpers/contracts-getters";
import {
  dryRunEncodedData,
  getParaSpaceAdmins,
} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {
  configureReservesByHelper,
  initReservesByHelper,
} from "../../helpers/init-helpers";
import {getParaSpaceConfig, waitForTx} from "../../helpers/misc-utils";
import {tEthereumAddress} from "../../helpers/types";

const releaseAethBendethCbethAstethRethAwsteth = async (verify = false) => {
  console.time("release-aeth-bendeth-cbeth-asteth-reth-awsteth");
  const paraSpaceConfig = getParaSpaceConfig();
  const protocolDataProvider = await getProtocolDataProvider();
  const paraSpaceOracle = await getParaSpaceOracle();

  const projects = [
    {
      symbol: "aWETH",
      address: "0x7649e0d153752c556b8b23DB1f1D3d42993E83a5",
      aggregator: "",
    },
    {
      symbol: "bendETH",
      address: "0x57FEbd640424C85b72b4361fE557a781C8d2a509",
      aggregator: "",
    },
    {
      symbol: "astETH",
      address: "0x4d7A1D1d05f6A1B87A6c382FfA003Aef1d7aF1D0",
      aggregator: "0xD6245F74B32389c9dA056A8C076D03d78dF0729A",
    },
    {
      symbol: "awstETH",
      address: "0xb278E539999942EAE8119eD2d72A2f8EC27aAf92",
      aggregator: "0x3885EBF000bc929Aa3d3bcA084d973b1B04Ee4ec",
    },
    {
      symbol: "cbETH",
      address: "0x0F23e38Ef5dd7d5a5cB58BB3c0030A6076EB6427",
      aggregator: "",
    },
    {
      symbol: "rETH",
      address: "0x67a5FA99B08d19aC11Ee496A74Fa43612543Eb90",
      aggregator: "",
    },
  ];

  console.time("deploy aggregators...");
  for (const project of projects) {
    if (project.aggregator) {
      continue;
    }
    if (project.symbol == "aWETH" || project.symbol == "bendETH") {
      project.aggregator = (
        await deployBaseCurrencySynchronicityPriceAdapter(
          "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          paraSpaceConfig.Oracle.BaseCurrencyUnit,
          project.symbol,
          verify
        )
      ).address;
    } else if (project.symbol == "rETH") {
      project.aggregator = (
        await deployExchangeRateSynchronicityPriceAdapter(
          project.address,
          project.symbol,
          verify
        )
      ).address;
    } else if (project.symbol == "awstETH") {
      project.aggregator = (
        await deployCLwstETHSynchronicityPriceAdapter(
          "0xD6245F74B32389c9dA056A8C076D03d78dF0729A",
          "0xaD03FfABC3bcae0f869BEa32544c0C0131Fd13Fe",
          verify
        )
      ).address;
    } else {
      project.aggregator = (
        await deployAggregator(
          project.symbol,
          parseEther("1").toString(),
          verify
        )
      ).address;
    }
  }
  console.timeEnd("deploy aggregators...");

  console.time("registering aggregators...");
  const assets = [...projects];
  if (DRY_RUN) {
    const encodedData = paraSpaceOracle.interface.encodeFunctionData(
      "setAssetSources",
      [assets.map((x) => x.address), assets.map((x) => x.aggregator)]
    );
    await dryRunEncodedData(paraSpaceOracle.address, encodedData);
  } else {
    await waitForTx(
      await paraSpaceOracle.setAssetSources(
        assets.map((x) => x.address),
        assets.map((x) => x.aggregator),
        GLOBAL_OVERRIDES
      )
    );
  }
  console.timeEnd("registering aggregators...");

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

  console.time("initializing reserves...");
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
  console.timeEnd("initializing reserves...");

  console.time("configuring reserves...");
  await configureReservesByHelper(
    reservesParams,
    allTokenAddresses,
    protocolDataProvider,
    paraSpaceAdminAddress
  );
  console.timeEnd("configuring reserves...");
  console.timeEnd("release-aeth-bendeth-cbeth-asteth-reth-awsteth");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseAethBendethCbethAstethRethAwsteth();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
