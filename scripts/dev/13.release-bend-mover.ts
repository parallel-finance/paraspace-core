import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  getFirstSigner,
  getNFTFloorOracle,
  getParaSpaceOracle,
  getPoolAddressesProvider,
  getPoolConfiguratorProxy,
  getProtocolDataProvider,
  getTimeLockProxy,
} from "../../helpers/contracts-getters";
import {
  dryRunEncodedData,
  getFunctionSignatures,
  getParaSpaceAdmins,
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
  deployPositionMoverLogic,
} from "../../helpers/contracts-deployments";
import {PoolPositionMover, PoolPositionMover__factory} from "../../types";

const releaseBendMover = async (verify = false) => {
  console.time("release-bend-mover");
  const paraSpaceOracle = await getParaSpaceOracle();
  const paraSpaceConfig = getParaSpaceConfig();
  const protocolDataProvider = await getProtocolDataProvider();
  const addressesProvider = await getPoolAddressesProvider();
  const nftFloorOracle = await getNFTFloorOracle();
  const configurator = await getPoolConfiguratorProxy();

  const encodedData0 = await configurator.interface.encodeFunctionData(
    "setSupplyCap",
    ["0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7", "200"]
  );
  await dryRunEncodedData(configurator.address, encodedData0);

  const encodedData1 = await configurator.interface.encodeFunctionData(
    "setSupplyCap",
    ["0x49cf6f5d44e70224e2e23fdcdd2c053f30ada28b", "50"]
  );
  await dryRunEncodedData(configurator.address, encodedData1);

  const encodedData2 = await configurator.interface.encodeFunctionData(
    "setSupplyCap",
    ["0xfE2460E9A57B3a283c4EDAD2780A0205c14bdb43", "50"]
  );
  await dryRunEncodedData(configurator.address, encodedData2);

  const encodedData3 = await configurator.interface.encodeFunctionData(
    "setSupplyCap",
    ["0x8a90CAb2b38dba80c64b7734e58Ee1dB38B8992e", "50"]
  );
  await dryRunEncodedData(configurator.address, encodedData3);

  const timeLock = await getTimeLockProxy();
  const encodedData4 = await timeLock.interface.encodeFunctionData(
    "unfreezeAgreement",
    ["3131"]
  );
  await dryRunEncodedData(timeLock.address, encodedData4);

  const projects = [
    {
      symbol: ERC721TokenContractId.BEANZ,
      address: "0x306b1ea3ecdf94ab739f1910bbda052ed4a9f949",
      aggregator: "",
    },
    {
      symbol: ERC721TokenContractId.DEGODS,
      address: "0x8821bee2ba0df28761afff119d66390d594cd280",
      aggregator: "",
    },
    {
      symbol: ERC721TokenContractId.EXP,
      address: "0x790b2cf29ed4f310bf7641f013c65d4560d28371",
      aggregator: "",
    },
    {
      symbol: ERC721TokenContractId.VSL,
      address: "0x5b1085136a811e55b2bb2ca1ea456ba82126a376",
      aggregator: "",
    },
    {
      symbol: ERC721TokenContractId.KODA,
      address: "0xe012baf811cf9c05c408e879c399960d1f305903",
      aggregator: "",
    },
    {
      symbol: ERC721TokenContractId.BLOCKS,
      address: "0x059EDD72Cd353dF5106D2B9cC5ab83a52287aC3a",
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

  const positionMoverLogic = await deployPositionMoverLogic(
    {
      "contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic":
        "0xBd25Aa1c423cD59662aD1C328f963ce90Afbd94B",
      "contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic":
        "0x7dc12cCe38Fd20393d19d5E4d65b021B35093aAB",
    },
    verify
  );

  const positionMoverLibraries = {
    ["contracts/protocol/libraries/logic/PositionMoverLogic.sol:PositionMoverLogic"]:
      positionMoverLogic.address,
  };

  const poolPositionMoverSelectors = getFunctionSignatures(
    PoolPositionMover__factory.abi
  );
  const poolPositionMover = (await withSaveAndVerify(
    new PoolPositionMover__factory(
      positionMoverLibraries,
      await getFirstSigner()
    ),
    eContractid.PoolPositionMoverImpl,
    [
      addressesProvider.address,
      paraSpaceConfig.BendDAO.LendingPoolLoan!,
      paraSpaceConfig.BendDAO.LendingPool!,
    ],
    verify,
    false,
    positionMoverLibraries,
    poolPositionMoverSelectors
  )) as PoolPositionMover;

  const proxyImplementation = [
    {
      implAddress: poolPositionMover.address,
      action: 0,
      functionSelectors: poolPositionMoverSelectors.map((s) => s.signature),
    },
  ];

  const encodedData6 = addressesProvider.interface.encodeFunctionData(
    "updatePoolImpl",
    [proxyImplementation, ZERO_ADDRESS, "0x"]
  );
  await dryRunEncodedData(addressesProvider.address, encodedData6);

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
