import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployERC721OracleWrapper,
  deployUniswapV3OracleWrapper,
} from "../../helpers/contracts-deployments";
import {
  getParaSpaceOracle,
  getPoolAddressesProvider,
  getProtocolDataProvider,
} from "../../helpers/contracts-getters";
import {
  getParaSpaceAdmins,
  printEncodedData,
} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {
  configureReservesByHelper,
  initReservesByHelper,
} from "../../helpers/init-helpers";
import {getParaSpaceConfig, waitForTx} from "../../helpers/misc-utils";
import {tEthereumAddress} from "../../helpers/types";

const releaseUniV3 = async (verify = false) => {
  console.time("release-uni-v3");
  const paraSpaceConfig = getParaSpaceConfig();
  const provider = await getPoolAddressesProvider();
  const protocolDataProvider = await getProtocolDataProvider();
  const paraSpaceOracle = await getParaSpaceOracle();

  console.time("deploy NFTFloorOracle...");
  const nftFloorOracle = "0xE7BD56364DedF1c5BeBEA9b77A748ab3C5F8c43E";
  const projects = [
    {
      symbol: "MOONBIRD",
      address: "0x23581767a106ae21c074b2276d25e5c3e136a68b",
      aggregator: "",
    },
    {
      symbol: "MEEBITS",
      address: "0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7",
      aggregator: "",
    },
    {
      symbol: "OTHR",
      address: "0x34d85c9cdeb23fa97cb08333b511ac86e1c4e258",
      aggregator: "",
    },
    // {
    //   symbol: "BAKC",
    //   address: "0xba30E5F9Bb24caa003E9f2f0497Ad287FDF95623",
    //   aggregator: "",
    // },
  ];
  console.timeEnd("deploy NFTFloorOracle...");

  console.time("deploy MOONBIRD, MEEBITS, OTHR aggregators...");
  for (const project of projects) {
    if (!project.aggregator) {
      project.aggregator = (
        await deployERC721OracleWrapper(
          provider.address,
          nftFloorOracle,
          project.address,
          project.symbol
        )
      ).address;
    }
  }
  console.timeEnd("deploy MOONBIRD, MEEBITS, OTHR aggregators...");

  console.time("deploy UniV3 aggregator...");
  const wrapper = await deployUniswapV3OracleWrapper(
    "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    provider.address,
    verify
  );
  console.timeEnd("deploy UniV3 aggregator...");

  console.time("registering aggregators...");
  const assets = [
    {
      symbol: "UniswapV3",
      address: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
      aggregator: wrapper.address,
    },
    {
      symbol: "stETH",
      address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      aggregator: "0x86392dC19c0b719886221c78AB11eb8Cf5c52812",
    },
    ...projects,
  ];
  if (DRY_RUN) {
    const encodedData = paraSpaceOracle.interface.encodeFunctionData(
      "setAssetSources",
      [assets.map((x) => x.address), assets.map((x) => x.aggregator)]
    );
    await printEncodedData(paraSpaceOracle.address, encodedData);
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

  console.timeEnd("release-uni-v3");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseUniV3();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
