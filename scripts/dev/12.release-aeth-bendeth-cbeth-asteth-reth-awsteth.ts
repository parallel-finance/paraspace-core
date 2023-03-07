import rawBRE from "hardhat";
import {OPENSEA_SEAPORT_V14_ID, ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployBaseCurrencySynchronicityPriceAdapter,
  deployExchangeRateSynchronicityPriceAdapter,
  deployReserveAuctionStrategy,
  deployUiPoolDataProvider,
} from "../../helpers/contracts-deployments";
import {
  getAllTokens,
  getParaSpaceOracle,
  getPoolAddressesProvider,
  getPoolConfiguratorProxy,
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
import {
  eContractid,
  ERC20TokenContractId,
  ERC721TokenContractId,
  IReserveParams,
  tEthereumAddress,
} from "../../helpers/types";
import {
  auctionStrategyBAKC,
  auctionStrategyOthr,
} from "../../market-config/auctionStrategies";

const releaseAethBendethCbethAstethRethAwsteth = async (verify = false) => {
  console.time("release-aeth-bendeth-cbeth-asteth-reth-awsteth");
  const paraSpaceConfig = getParaSpaceConfig();
  const protocolDataProvider = await getProtocolDataProvider();
  const paraSpaceOracle = await getParaSpaceOracle();
  const configurator = await getPoolConfiguratorProxy();
  const addressesProvider = await getPoolAddressesProvider();
  const allTokens = await getAllTokens();

  if (DRY_RUN) {
    const encodedData1 = addressesProvider.interface.encodeFunctionData(
      "setMarketplace",
      [
        OPENSEA_SEAPORT_V14_ID,
        "0x00000000000001ad428e4906aE43D8F9852d0dD6",
        "0x2D51197B2160000DD4a616578249f173337487F4",
        "0x00000000000001ad428e4906aE43D8F9852d0dD6",
        false,
      ]
    );
    await dryRunEncodedData(addressesProvider.address, encodedData1);

    const encodedData2 = configurator.interface.encodeFunctionData(
      "setReserveInterestRateStrategyAddress",
      [
        allTokens[ERC20TokenContractId.DAI].address,
        "0x0F384682ccbc84B736BeF58F007DAE77F3E4FdA6",
      ]
    );
    await dryRunEncodedData(configurator.address, encodedData2);

    const newStrategyOthr = await deployReserveAuctionStrategy(
      auctionStrategyOthr.name,
      [
        auctionStrategyOthr.maxPriceMultiplier.toString(),
        auctionStrategyOthr.minExpPriceMultiplier.toString(),
        auctionStrategyOthr.minPriceMultiplier.toString(),
        auctionStrategyOthr.stepLinear.toString(),
        auctionStrategyOthr.stepExp.toString(),
        auctionStrategyOthr.tickLength.toString(),
      ],
      verify
    );
    const encodedData3 = configurator.interface.encodeFunctionData(
      "setReserveAuctionStrategyAddress",
      [allTokens[ERC721TokenContractId.OTHR].address, newStrategyOthr.address]
    );
    await dryRunEncodedData(configurator.address, encodedData3);

    const newStrategyBAKC = await deployReserveAuctionStrategy(
      auctionStrategyBAKC.name,
      [
        auctionStrategyBAKC.maxPriceMultiplier.toString(),
        auctionStrategyBAKC.minExpPriceMultiplier.toString(),
        auctionStrategyBAKC.minPriceMultiplier.toString(),
        auctionStrategyBAKC.stepLinear.toString(),
        auctionStrategyBAKC.stepExp.toString(),
        auctionStrategyBAKC.tickLength.toString(),
      ],
      verify
    );
    const encodedData4 = configurator.interface.encodeFunctionData(
      "setReserveAuctionStrategyAddress",
      [allTokens[ERC721TokenContractId.BAKC].address, newStrategyBAKC.address]
    );
    await dryRunEncodedData(configurator.address, encodedData4);
  }

  const projects = [
    {
      symbol: "aWETH",
      address: "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e",
      aggregator: "",
    },
    // {
    //   symbol: "bendETH",
    //   address: "0xeD1840223484483C0cb050E6fC344d1eBF0778a9",
    //   aggregator: "",
    // },
    // {
    //   symbol: "astETH",
    //   address: "0x1982b2f5814301d4e9a8b0201555376e62f82428",
    //   aggregator: "0x86392dC19c0b719886221c78AB11eb8Cf5c52812",
    // },
    // {
    //   symbol: "awstETH",
    //   address: "0x0B925eD163218f6662a35e0f0371Ac234f9E9371",
    //   aggregator: "0x1d05d899c3AC6CfA35D50c063325ccA39727c7c8",
    // },
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
    {
      symbol: "WBTC",
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      aggregator: "0xdeb288f737066589598e9214e782fa5a8ed689e8",
    },
    {
      symbol: "FRAX",
      address: "0x853d955acef822db058eb8505911ed77f175b99e",
      aggregator: "0x14d04fff8d21bd62987a5ce9ce543d2f1edf5d3e",
    },
  ];

  console.time("deploy aggregators...");
  for (const project of projects) {
    if (project.aggregator) {
      continue;
    }
    if (project.symbol == "aWETH") {
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

  const reserves = Object.entries(reservesParams).filter(
    ([, {xTokenImpl}]) =>
      xTokenImpl === eContractid.DelegationAwarePTokenImpl ||
      xTokenImpl === eContractid.PTokenImpl ||
      xTokenImpl === eContractid.NTokenImpl ||
      xTokenImpl === eContractid.NTokenBAYCImpl ||
      xTokenImpl === eContractid.NTokenMAYCImpl ||
      xTokenImpl === eContractid.NTokenMoonBirdsImpl ||
      xTokenImpl === eContractid.NTokenUniswapV3Impl ||
      xTokenImpl === eContractid.PTokenStETHImpl ||
      xTokenImpl === eContractid.PTokenATokenImpl ||
      xTokenImpl === eContractid.PTokenSApeImpl ||
      xTokenImpl === eContractid.PTokenCApeImpl ||
      xTokenImpl === eContractid.PYieldTokenImpl ||
      xTokenImpl === eContractid.NTokenBAKCImpl
  ) as [string, IReserveParams][];

  console.time("initializing reserves...");
  await initReservesByHelper(
    reserves,
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
    reserves,
    allTokenAddresses,
    protocolDataProvider,
    paraSpaceAdminAddress
  );
  console.timeEnd("configuring reserves...");

  await deployUiPoolDataProvider(
    "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    verify
  );
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
