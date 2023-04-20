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
  insertContractAddressInDb,
} from "../../helpers/contracts-helpers";
import {
  configureReservesByHelper,
  initReservesByHelper,
} from "../../helpers/init-helpers";
import {getParaSpaceConfig} from "../../helpers/misc-utils";
import {ERC721TokenContractId, tEthereumAddress} from "../../helpers/types";
import {
  deployERC721OracleWrapper,
  deployMintableERC721,
} from "../../helpers/contracts-deployments";

const releaseCollateralSwapV2 = async (verify = false) => {
  console.time("release-collateral-swap-v2");
  const paraSpaceOracle = await getParaSpaceOracle();
  const paraSpaceConfig = getParaSpaceConfig();
  const protocolDataProvider = await getProtocolDataProvider();
  const addressesProvider = await getPoolAddressesProvider();
  const nftFloorOracle = await getNFTFloorOracle();

  const projects = [
    {
      symbol: ERC721TokenContractId.HVMTL,
      address: "",
      aggregator: "",
    },
  ];
  for (const project of projects) {
    if (!project.address) {
      project.address = (
        await deployMintableERC721([project.symbol, project.symbol, ""], verify)
      ).address;
      await insertContractAddressInDb(project.symbol, project.address, false);
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
  const encodedData5 = paraSpaceOracle.interface.encodeFunctionData(
    "setAssetSources",
    [assets.map((x) => x.address), assets.map((x) => x.aggregator)]
  );
  await dryRunEncodedData(paraSpaceOracle.address, encodedData5);

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
    paraSpaceConfig.DelegationRegistry,
    verify
  );

  console.log("configuring reserves");
  await configureReservesByHelper(
    reserves,
    allTokenAddresses,
    protocolDataProvider,
    paraSpaceAdminAddress
  );

  console.timeEnd("release-collateral-swap-v2");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseCollateralSwapV2();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
