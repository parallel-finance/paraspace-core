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
import {deployERC721OracleWrapper} from "../../helpers/contracts-deployments";

const releaseHVMTL = async (verify = false) => {
  console.time("release-hvmtl");
  const paraSpaceOracle = await getParaSpaceOracle();
  const paraSpaceConfig = getParaSpaceConfig();
  const protocolDataProvider = await getProtocolDataProvider();
  const addressesProvider = await getPoolAddressesProvider();
  const nftFloorOracle = await getNFTFloorOracle();

  // 1. deploy nft
  const hvmtl = paraSpaceConfig.Tokens.HVMTL;
  await insertContractAddressInDb("HVMTL", hvmtl, false);

  // oracle setting
  const projects = [
    {
      symbol: ERC721TokenContractId.HVMTL,
      address: hvmtl,
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

  const reserves = Object.entries(reservesParams).filter(
    (each) => each[0] !== "yAPE"
  );

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
    "0xc1d07eAA71fF3411271efC313bC53c784cd6aBD8",
    "0x39E4c2Fc79D4C39749BaD41D09af4C8901066477",
    "0x986a94186c0F16Ce8D7e14456A3833C6Eb6Df4bE"
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
