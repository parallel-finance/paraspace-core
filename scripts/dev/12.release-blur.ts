import rawBRE from "hardhat";
import {X2Y2_ID, ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployUniswapV3TwapOracleWrapper,
  deployX2Y2Adapter,
} from "../../helpers/contracts-deployments";
import {
  getAllTokens,
  getParaSpaceOracle,
  getPoolAddressesProvider,
  getProtocolDataProvider,
  getX2Y2R1,
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
import {ERC20TokenContractId, tEthereumAddress} from "../../helpers/types";

const releaseBlur = async (verify = false) => {
  console.time("release-blur");
  const paraSpaceConfig = await getParaSpaceConfig();
  const protocolDataProvider = await getProtocolDataProvider();
  const paraSpaceOracle = await getParaSpaceOracle();
  const allTokens = await getAllTokens();
  const addressesProvider = await getPoolAddressesProvider();
  const x2y2R1 = await getX2Y2R1();

  const x2y2Adapter = await deployX2Y2Adapter(
    addressesProvider.address,
    verify
  );
  await waitForTx(
    await addressesProvider.setMarketplace(
      X2Y2_ID,
      x2y2R1.address,
      x2y2Adapter.address,
      x2y2R1.address,
      false,
      GLOBAL_OVERRIDES
    )
  );

  const projects = [
    {
      symbol: "BLUR",
      address: allTokens[ERC20TokenContractId.BLUR].address,
      aggregator: "",
    },
  ];

  for (const project of projects) {
    if (!project.aggregator) {
      project.aggregator = (
        await deployUniswapV3TwapOracleWrapper(
          "0x5b1f7fbede4bb4bb0137397a4788dd077bd4d2a5",
          allTokens[ERC20TokenContractId.WETH].address,
          "1800",
          "TwapBLUR"
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

  await initReservesByHelper(
    reservesParams,
    allTokenAddresses,
    PTokenNamePrefix,
    VariableDebtTokenNamePrefix,
    SymbolPrefix,
    paraSpaceAdminAddress,
    treasuryAddress,
    ZERO_ADDRESS,
    verify
  );

  console.log("configuring reserves");
  await configureReservesByHelper(
    reservesParams,
    allTokenAddresses,
    protocolDataProvider,
    paraSpaceAdminAddress
  );

  console.timeEnd("release-blur");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseBlur();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
