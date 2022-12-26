import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {deployAutoCompoundApe} from "../../helpers/contracts-deployments";
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
import {step_20} from "../deployments/steps/20_renounceOwnership";
import {upgradePool} from "../upgrade";

const releaseV13 = async (verify = false) => {
  await DRE.run("set-DRE");
  console.time("release-v1.3");
  const paraSpaceConfig = getParaSpaceConfig();
  const paraspaceOracle = await getParaSpaceOracle();
  const protocolDataProvider = await getProtocolDataProvider();

  try {
    console.time("deploy AutoCompoundApe");
    const cAPE = await deployAutoCompoundApe(false);
    console.timeEnd("deploy AutoCompoundApe");

    console.time("upgrade pool");
    await upgradePool(false);
    console.timeEnd("upgrade pool");

    console.log("deploying cAPE aggregator...");
    const assets = [
      {
        symbol: "cAPE",
        address: cAPE.address,
        aggregator: "0xc7de7f4d4C9c991fF62a07D18b3E31e349833A18",
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

    console.log("renouncing ownership to timelock...");
    await step_20(verify, {
      paraSpaceAdminAddress: "0xca8678d2d273b1913148402aed2E99b085ea3F02",
      gatewayAdminAddress: "0xca8678d2d273b1913148402aed2E99b085ea3F02",
      riskAdminAddress: "0xca8678d2d273b1913148402aed2E99b085ea3F02",
    });

    console.timeEnd("release-v1.3");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseV13();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
