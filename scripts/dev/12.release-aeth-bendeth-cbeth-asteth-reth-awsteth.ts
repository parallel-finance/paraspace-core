import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployBaseCurrencySynchronicityPriceAdapter,
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
      address: "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e",
      aggregator: "",
    },
    {
      symbol: "bendETH",
      address: "0xeD1840223484483C0cb050E6fC344d1eBF0778a9",
      aggregator: "",
    },
    {
      symbol: "astETH",
      address: "0x1982b2f5814301d4e9a8b0201555376e62f82428",
      aggregator: "0x86392dC19c0b719886221c78AB11eb8Cf5c52812",
    },
    {
      symbol: "awstETH",
      address: "0x0B925eD163218f6662a35e0f0371Ac234f9E9371",
      aggregator: "0x1d05d899c3AC6CfA35D50c063325ccA39727c7c8",
    },
    {
      symbol: "cbETH",
      address: "0xbe9895146f7af43049ca1c1ae358b0541ea49704",
      aggregator: "0xf017fcb346a1885194689ba23eff2fe6fa5c483b",
    },
    {
      symbol: "rETH",
      address: "0xae78736cd615f374d3085123a210448e74fc6393",
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
    }
    if (project.symbol == "rETH") {
      project.aggregator = (
        await deployExchangeRateSynchronicityPriceAdapter(
          project.address,
          project.symbol,
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
