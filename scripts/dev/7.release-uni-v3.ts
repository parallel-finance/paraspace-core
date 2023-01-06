import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {deployUniswapV3OracleWrapper} from "../../helpers/contracts-deployments";
import {
  getParaSpaceOracle,
  getPoolAddressesProvider,
  getProtocolDataProvider,
} from "../../helpers/contracts-getters";
import {getParaSpaceAdmins} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {
  configureReservesByHelper,
  initReservesByHelper,
} from "../../helpers/init-helpers";
import {getParaSpaceConfig, waitForTx} from "../../helpers/misc-utils";
import {tEthereumAddress} from "../../helpers/types";
import {step_20} from "../deployments/steps/20_renounceOwnership";

const releaseUniV3 = async (verify = false) => {
  console.time("release-uni-v3");
  const paraSpaceConfig = getParaSpaceConfig();
  const provider = await getPoolAddressesProvider();
  const protocolDataProvider = await getProtocolDataProvider();
  const paraSpaceOracle = await getParaSpaceOracle();

  console.time("deploy UniV3 aggregator...");
  const wrapper = await deployUniswapV3OracleWrapper(
    "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    provider.address,
    verify
  );
  console.timeEnd("deploy UniV3 aggregator...");

  console.time("registering UniV3 aggregator...");
  const assets = [
    {
      symbol: "UniswapV3",
      address: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
      aggregator: wrapper.address,
    },
  ];
  if (DRY_RUN) {
    const encodedData = paraSpaceOracle.interface.encodeFunctionData(
      "setAssetSources",
      [assets.map((x) => x.address), assets.map((x) => x.aggregator)]
    );
    console.log(`hex: ${encodedData}`);
  } else {
    await waitForTx(
      await paraSpaceOracle.setAssetSources(
        assets.map((x) => x.address),
        assets.map((x) => x.aggregator),
        GLOBAL_OVERRIDES
      )
    );
  }
  console.timeEnd("registering aggregators...");

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

  console.time("initializing reserves...");
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
  console.timeEnd("initializing reserves...");

  console.time("configuring reserves...");
  await configureReservesByHelper(
    reservesParams,
    allTokenAddresses,
    protocolDataProvider,
    paraSpaceAdminAddress
  );
  console.timeEnd("configuring reserves...");

  console.time("renouncing ownership to timelock...");
  await step_20(verify, {
    paraSpaceAdminAddress: "0xca8678d2d273b1913148402aed2E99b085ea3F02",
    gatewayAdminAddress: "0xca8678d2d273b1913148402aed2E99b085ea3F02",
    riskAdminAddress: "0xca8678d2d273b1913148402aed2E99b085ea3F02",
  });
  console.timeEnd("renouncing ownership to timelock...");

  console.timeEnd("release-uni-v3");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseUniV3();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
