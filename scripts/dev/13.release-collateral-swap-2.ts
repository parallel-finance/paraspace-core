import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  getFirstSigner,
  getNFTFloorOracle,
  getParaSpaceOracle,
  getPoolAddressesProvider,
  getPoolProxy,
  getProtocolDataProvider,
} from "../../helpers/contracts-getters";
import {
  dryRunEncodedData,
  getContractAddressInDb,
  getParaSpaceAdmins,
  insertContractAddressInDb,
  withSaveAndVerify,
} from "../../helpers/contracts-helpers";
import {
  configureReservesByHelper,
  initReservesByHelper,
} from "../../helpers/init-helpers";
import {getParaSpaceConfig} from "../../helpers/misc-utils";
import {
  eContractid,
  ERC721TokenContractId,
  tEthereumAddress,
} from "../../helpers/types";
import {
  deployERC721OracleWrapper,
  deployMarketplaceLogic,
  deployPoolCoreLibraries,
  deployTimeLockImpl,
  getPoolSignatures,
} from "../../helpers/contracts-deployments";
import {
  PoolCore,
  PoolCore__factory,
  PoolMarketplace,
  PoolMarketplace__factory,
} from "../../types";
import {pick} from "lodash";
import {upgradeProxyImplementations} from "../upgrade/pool";

const releaseCollateralSwapV2 = async (verify = false) => {
  console.time("release-collateral-swap-v2");
  const paraSpaceOracle = await getParaSpaceOracle();
  const paraSpaceConfig = getParaSpaceConfig();
  const protocolDataProvider = await getProtocolDataProvider();
  const addressesProvider = await getPoolAddressesProvider();
  const nftFloorOracle = await getNFTFloorOracle();
  const pool = await getPoolProxy();

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

  await deployTimeLockImpl(addressesProvider.address, verify);

  ////////////////////////////////////////////////////////////////////////////////

  const coreLibraries = await deployPoolCoreLibraries(verify);
  const {poolCoreSelectors} = getPoolSignatures();

  const poolCore = (await withSaveAndVerify(
    new PoolCore__factory(coreLibraries, await getFirstSigner()),
    eContractid.PoolCoreImpl,
    [
      addressesProvider.address,
      await getContractAddressInDb(eContractid.TimeLockProxy),
    ],
    verify,
    false,
    coreLibraries,
    poolCoreSelectors
  )) as PoolCore;

  const marketplaceLogic = await deployMarketplaceLogic(
    pick(coreLibraries, [
      "contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic",
      "contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic",
    ]),
    verify
  );
  const marketplaceLibraries = {
    "contracts/protocol/libraries/logic/MarketplaceLogic.sol:MarketplaceLogic":
      marketplaceLogic.address,
  };

  const {poolMarketplaceSelectors} = getPoolSignatures();

  const poolMarketplace = (await withSaveAndVerify(
    new PoolMarketplace__factory(marketplaceLibraries, await getFirstSigner()),
    eContractid.PoolMarketplaceImpl,
    [addressesProvider.address],
    verify,
    false,
    marketplaceLibraries,
    poolMarketplaceSelectors
  )) as PoolMarketplace;

  const oldPoolMarketplaceSelectors = await pool.facetFunctionSelectors(
    "0x3B0dEE41aD8979948A3D576419648498390046D1"
  );
  const oldPoolCoreSelectors = await pool.facetFunctionSelectors(
    "0x48dd30d66e31D143f75aBFCC7feD33E24F983E0f"
  );
  const newPoolCoreSelectors = poolCoreSelectors.map((s) => s.signature);
  const newPoolMarketplaceSelectors = poolMarketplaceSelectors.map(
    (s) => s.signature
  );

  const implementations = [
    [poolCore.address, newPoolCoreSelectors, oldPoolCoreSelectors],
    [
      poolMarketplace.address,
      newPoolMarketplaceSelectors,
      oldPoolMarketplaceSelectors,
    ],
  ] as [string, string[], string[]][];

  await upgradeProxyImplementations(implementations);

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
