import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {deployUniswapV3TwapOracleWrapper} from "../../helpers/contracts-deployments";
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
import {ERC20TokenContractId, tEthereumAddress} from "../../helpers/types";

const releaseBlur = async (verify = false) => {
  console.time("release-blur");
  const paraSpaceConfig = await getParaSpaceConfig();
  const protocolDataProvider = await getProtocolDataProvider();
  const paraSpaceOracle = await getParaSpaceOracle();
  const allTokens = await getAllTokens();

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
          "0x824a30f2984f9013f2c8d0a29c0a3cc5fd5c0673",
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
    verify,
    "0x46d24Ac3f5c7eeFF3f79D107BB727Bfa8e70B770",
    undefined,
    "0x986a94186c0F16Ce8D7e14456A3833C6Eb6Df4bE",
    "0x457A5eC6F2F3A98FD470a65Ad3Dcb593ff842c6d"
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
