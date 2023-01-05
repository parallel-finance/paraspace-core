import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployAggregator,
  deployMockedDelegateRegistry,
} from "../../helpers/contracts-deployments";
import {
  getParaSpaceOracle,
  getProtocolDataProvider,
} from "../../helpers/contracts-getters";
import {getParaSpaceAdmins} from "../../helpers/contracts-helpers";
import {GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {
  configureReservesByHelper,
  initReservesByHelper,
} from "../../helpers/init-helpers";
import {DRE, getParaSpaceConfig, waitForTx} from "../../helpers/misc-utils";
import {tEthereumAddress} from "../../helpers/types";

const releaseV14 = async (verify = false) => {
  await DRE.run("set-DRE");
  const paraSpaceConfig = getParaSpaceConfig();
  const paraspaceOracle = await getParaSpaceOracle();
  const protocolDataProvider = await getProtocolDataProvider();

  console.time("release-v1.4");
  console.time("deploy mocked delegate registry");
  await deployMockedDelegateRegistry(verify);
  console.timeEnd("deploy mocked delegate registry");

  console.log("deploying BAKC aggregator...");
  const bakcAggregator = await deployAggregator(
    "BAKC",
    // eslint-disable-next-line
    paraSpaceConfig.Mocks?.AllAssetsInitialPrices.BAKC!,
    verify
  );
  const assets = [
    {
      symbol: "BAKC",
      address: "0xd60d682764Ee04e54707Bee7B564DC65b31884D0",
      aggregator: bakcAggregator.address,
    },
  ];
  console.log("registering aggregators...");
  await waitForTx(
    await paraspaceOracle.setAssetSources(
      assets.map((x) => x.address),
      assets.map((x) => x.aggregator),
      GLOBAL_OVERRIDES
    )
  );

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

  console.log("initializing reserves...");
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
  console.log("configuring reserves...");
  await configureReservesByHelper(
    reservesParams,
    allTokenAddresses,
    protocolDataProvider,
    paraSpaceAdminAddress
  );

  console.timeEnd("release-v1.4");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseV14();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
