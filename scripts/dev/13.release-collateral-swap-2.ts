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
  getContractAddressInDb,
  getParaSpaceAdmins,
  insertContractAddressInDb,
} from "../../helpers/contracts-helpers";
import {
  configureReservesByHelper,
  initReservesByHelper,
} from "../../helpers/init-helpers";
import {getParaSpaceConfig} from "../../helpers/misc-utils";
import {ERC721TokenContractId, tEthereumAddress} from "../../helpers/types";
import {deployERC721OracleWrapper} from "../../helpers/contracts-deployments";

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
      address: "0x4b15a9c28034dc83db40cd810001427d3bd7163d",
      aggregator: "",
    },
  ];
  for (const project of projects) {
    if (!(await getContractAddressInDb(project.address))) {
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
  const encodedData1 = paraSpaceOracle.interface.encodeFunctionData(
    "setAssetSources",
    [assets.map((x) => x.address), assets.map((x) => x.aggregator)]
  );
  await dryRunEncodedData(paraSpaceOracle.address, encodedData1);

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
    verify,
    "0xF2Daf76987eBae6e83C0e50E5e5C22290687C22C",
    "0x39E4c2Fc79D4C39749BaD41D09af4C8901066477",
    "0x0f59196757B5BEDb94c149FB20E43D0323c52eA2",
    "0x41BE4a63035025d79dEbecCE8df682e507fC0A2f"
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
