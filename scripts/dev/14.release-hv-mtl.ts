import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  getNFTFloorOracle,
  getParaSpaceOracle,
  getPoolAddressesProvider,
  getProtocolDataProvider,
} from "../../helpers/contracts-getters";
import {dryRunEncodedData, getParaSpaceAdmins, insertContractAddressInDb,} from "../../helpers/contracts-helpers";
import {configureReservesByHelper, initReservesByHelper,} from "../../helpers/init-helpers";
import {getDb, getParaSpaceConfig} from "../../helpers/misc-utils";
import {ERC721TokenContractId, tEthereumAddress,} from "../../helpers/types";
import {deployERC721OracleWrapper, deployMintableERC721,} from "../../helpers/contracts-deployments";

const releaseHVMTL = async (verify = false) => {
  console.time("release-hvmtl");
  const paraSpaceOracle = await getParaSpaceOracle();
  const paraSpaceConfig = getParaSpaceConfig();
  const protocolDataProvider = await getProtocolDataProvider();
  const addressesProvider = await getPoolAddressesProvider();
  const nftFloorOracle = await getNFTFloorOracle();

  // 1. deploy nft
  const hvmtl = await deployMintableERC721(
      ['HVMTL', 'NVMTL', ""],
      verify
  );
  await insertContractAddressInDb(
      'HVMTL',
      hvmtl.address,
      false
  );




  //  supply cap ??
  // const encodedData0 = await configurator.interface.encodeFunctionData(
  //   "setSupplyCap",
  //   ["0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7", "200"]
  // );
  // await dryRunEncodedData(configurator.address, encodedData0);

  // oracle setting
  const projects = [
    {
      symbol: ERC721TokenContractId.HVMTL,
      address: "0x4b15a9c28034dC83db40CD810001427d3BD7163D",
      aggregator: "",
    },
  ];
  for (const project of projects) {
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
    verify,
    paraSpaceConfig.DelegationRegistry,
    undefined,
    "0x39E4c2Fc79D4C39749BaD41D09af4C8901066477",
    "0x986a94186c0F16Ce8D7e14456A3833C6Eb6Df4bE",
    "0xE2FB283EF087F99441aa28ba69D1e641d2b4d026"
  );

  console.log("configuring reserves");
  await configureReservesByHelper(
    reserves,
    allTokenAddresses,
    protocolDataProvider,
    paraSpaceAdminAddress
  );


  console.timeEnd("release-hvmtl");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseHVMTL();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
