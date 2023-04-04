import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {deployStakefishNFTOracleWrapper} from "../../helpers/contracts-deployments";
import {
  getAllTokens,
  getParaSpaceOracle,
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

const releaseStakefish = async (verify = false) => {
  console.time("release-stakefish");
  const allTokens = await getAllTokens();
  const paraSpaceOracle = await getParaSpaceOracle();
  const paraSpaceConfig = await getParaSpaceConfig();
  const protocolDataProvider = await getProtocolDataProvider();
  const projects = [
    {
      symbol: "SFVLDR",
      address: allTokens[ERC721TokenContractId.SFVLDR].address,
      aggregator: "",
    },
  ];

  for (const project of projects) {
    if (!project.aggregator) {
      if (project.symbol === ERC721TokenContractId.SFVLDR) {
        project.aggregator = (
          await deployStakefishNFTOracleWrapper(
            paraSpaceConfig.StakefishManager!
          )
        ).address;
      }
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
  console.log(reserves[ERC721TokenContractId.SFVLDR]);

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
    verify
  );

  console.log("configuring reserves");
  await configureReservesByHelper(
    reserves,
    allTokenAddresses,
    protocolDataProvider,
    paraSpaceAdminAddress
  );

  console.timeEnd("release-stakefish");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseStakefish();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
