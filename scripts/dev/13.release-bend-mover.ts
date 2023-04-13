import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  getFirstSigner,
  getNFTFloorOracle,
  getParaSpaceOracle,
  getPoolAddressesProvider,
  getProtocolDataProvider,
} from "../../helpers/contracts-getters";
import {
  dryRunEncodedData,
  getFunctionSignatures,
  getParaSpaceAdmins,
  withSaveAndVerify,
} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {
  configureReservesByHelper,
  initReservesByHelper,
} from "../../helpers/init-helpers";
import {getParaSpaceConfig, waitForTx} from "../../helpers/misc-utils";
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
  const projects = [
    {
      symbol: ERC721TokenContractId.BEANZ,
      address: "0x8821bee2ba0df28761afff119d66390d594cd280",
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

  const positionMoverLogic = await deployPositionMoverLogic(
    {
      "contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic": "",
      "contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic": "",
    },
    verify
  );

  const positionMoverLibraries = {
    ["contracts/protocol/libraries/logic/PositionMoverLogic.sol:PositionMoverLogic"]:
      positionMoverLogic.address,
  };

  const bendDaoLendPool = paraSpaceConfig.BendDAO.LendingPool;
  const poolPositionMoverSelectors = getFunctionSignatures(
    PoolPositionMover__factory.abi
  );
  const poolPositionMover = (await withSaveAndVerify(
    new PoolPositionMover__factory(
      positionMoverLibraries,
      await getFirstSigner()
    ),
    eContractid.PoolPositionMoverImpl,
    [addressesProvider.address, bendDaoLendPool!, bendDaoLendPool!],
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

  if (DRY_RUN) {
    const encodedData = addressesProvider.interface.encodeFunctionData(
      "updatePoolImpl",
      [proxyImplementation, ZERO_ADDRESS, "0x"]
    );
    await dryRunEncodedData(addressesProvider.address, encodedData);
  } else {
    await waitForTx(
      await addressesProvider.updatePoolImpl(
        proxyImplementation,
        ZERO_ADDRESS,
        "0x",
        GLOBAL_OVERRIDES
      )
    );
  }

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
