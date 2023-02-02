import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployERC721OracleWrapper,
  deployUiPoolDataProvider,
} from "../../helpers/contracts-deployments";
import {
  getParaSpaceOracle,
  getPoolAddressesProvider,
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

const adHoc = async () => {
  console.time("ad-hoc");
  const provider = await getPoolAddressesProvider();
  const paraSpaceOracle = await getParaSpaceOracle();
  const paraSpaceConfig = getParaSpaceConfig();
  const protocolDataProvider = await getProtocolDataProvider();

  const nftFloorOracle = "0x8a84ce9d8eefcd759321a918cf154983622342ee";
  const projects = [
    {
      symbol: "SEWER",
      address: "0x3aa026cd539fa1f6ae58ae238a10e2f1cf831454",
      aggregator: "",
    },
    {
      symbol: "PPG",
      address: "0xf140558cA4d4e10f63661504D4F3f74FADDDe3E8",
      aggregator: "",
    },
  ];

  console.time("deploy SEWER, PPG aggregator...");
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
  console.timeEnd("deploy SEWER, PPG aggregator...");

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
    false
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

  await deployUiPoolDataProvider(
    "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
    "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
    false
  );

  // await deployMintableERC721(["PPG", "PPG", ""], false);
  console.timeEnd("ad-hoc");
};

async function main() {
  await rawBRE.run("set-DRE");
  await adHoc();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
