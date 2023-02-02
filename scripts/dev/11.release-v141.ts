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

const releaseV141 = async () => {
  console.time("release-v141");
  const provider = await getPoolAddressesProvider();
  const paraSpaceOracle = await getParaSpaceOracle();
  const paraSpaceConfig = getParaSpaceConfig();
  const protocolDataProvider = await getProtocolDataProvider();

  const nftFloorOracle = "0xE7BD56364DedF1c5BeBEA9b77A748ab3C5F8c43E";
  const projects = [
    {
      symbol: "SEWER",
      address: "0x764AeebcF425d56800eF2c84F2578689415a2DAa",
      aggregator: "",
    },
    {
      symbol: "PPG",
      address: "0xbd3531da5cf5857e7cfaa92426877b022e612cf8",
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
    "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    false
  );

  // await deployMintableERC721(["PPG", "PPG", ""], false);
  console.timeEnd("release-v141");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseV141();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
