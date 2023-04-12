import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  getNFTFloorOracle,
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
import {ERC721TokenContractId, tEthereumAddress} from "../../helpers/types";
import {
  deployERC721OracleWrapper,
  deployMintableNonEnumerableERC721,
} from "../../helpers/contracts-deployments";

const releaseBendMover = async (verify = false) => {
  console.time("release-bend-mover");
  const paraSpaceOracle = await getParaSpaceOracle();
  const paraSpaceConfig = await getParaSpaceConfig();
  const protocolDataProvider = await getProtocolDataProvider();
  const addressesProvider = await getPoolAddressesProvider();
  const nftFloorOracle = await getNFTFloorOracle();
  const projects = [
    {
      symbol: ERC721TokenContractId.BEANZ,
      address: "",
      aggregator: "",
    },
    {
      symbol: ERC721TokenContractId.DeGods,
      address: "",
      aggregator: "",
    },
    {
      symbol: ERC721TokenContractId.EXP,
      address: "",
      aggregator: "",
    },
    {
      symbol: ERC721TokenContractId.VSL,
      address: "",
      aggregator: "",
    },
    {
      symbol: ERC721TokenContractId.KODA,
      address: "",
      aggregator: "",
    },
    {
      symbol: ERC721TokenContractId.SQGL,
      address: "",
      aggregator: "",
    },
  ];

  for (const project of projects) {
    if (!project.address) {
      project.address = (
        await deployMintableNonEnumerableERC721(
          [project.symbol, project.symbol, ""],
          false
        )
      ).address;
    }
    if (!project.aggregator) {
      project.aggregator = (
        await deployERC721OracleWrapper(
          addressesProvider.address,
          nftFloorOracle.address,
          project.address,
          project.symbol,
          verify
        )
      ).address;
    }
  }

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

  console.log("init reserves");
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

  const reserves = Object.entries(reservesParams);

  await initReservesByHelper(
    reserves,
    allTokenAddresses,
    PTokenNamePrefix,
    VariableDebtTokenNamePrefix,
    SymbolPrefix,
    paraSpaceAdminAddress,
    treasuryAddress,
    ZERO_ADDRESS,
    ZERO_ADDRESS,
    verify,
    paraSpaceConfig.DelegationRegistry
  );

  console.log("configuring reserves");
  await configureReservesByHelper(
    reserves,
    allTokenAddresses,
    protocolDataProvider,
    paraSpaceAdminAddress
  );

  console.timeEnd("release-bend-mover");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseBendMover();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
