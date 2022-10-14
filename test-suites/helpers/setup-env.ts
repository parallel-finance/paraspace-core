import rawBRE from "hardhat";
import {printContracts} from "../../deploy/helpers/misc-utils";
import {initializeMakeSuite} from "./make-suite";
import {step_00} from "../../deploy/tasks/deployments/testnet/steps/00_deleteDb";
import {step_01} from "../../deploy/tasks/deployments/testnet/steps/01_mockERC20Tokens";
import {step_02} from "../../deploy/tasks/deployments/testnet/steps/02_mockERC721Tokens";
import {step_03} from "../../deploy/tasks/deployments/testnet/steps/03_faucet";
import {step_04} from "../../deploy/tasks/deployments/testnet/steps/04_addressProvider";
import {step_05} from "../../deploy/tasks/deployments/testnet/steps/05_aclManager";
import {step_06} from "../../deploy/tasks/deployments/testnet/steps/06_poolAddressesProviderRegistry";
import {step_07} from "../../deploy/tasks/deployments/testnet/steps/07_pool";
import {step_08} from "../../deploy/tasks/deployments/testnet/steps/08_poolConfigurator";
import {step_09} from "../../deploy/tasks/deployments/testnet/steps/09_reservesSetupHelper";
import {step_10} from "../../deploy/tasks/deployments/testnet/steps/10_priceOracle";
import {step_11} from "../../deploy/tasks/deployments/testnet/steps/11_allMockAggregators";
import {step_12} from "../../deploy/tasks/deployments/testnet/steps/12_uiIncentiveDataProvider";
import {step_13} from "../../deploy/tasks/deployments/testnet/steps/13_wethGateway";
import {step_14} from "../../deploy/tasks/deployments/testnet/steps/14_punkGateway";
import {step_15} from "../../deploy/tasks/deployments/testnet/steps/15_uniswapV3Gateway";
import {step_16} from "../../deploy/tasks/deployments/testnet/steps/16_seaport";
import {step_17} from "../../deploy/tasks/deployments/testnet/steps/17_looksrare";
import {step_18} from "../../deploy/tasks/deployments/testnet/steps/18_x2y2";
import {step_19} from "../../deploy/tasks/deployments/testnet/steps/19_flashClaimRegistry";

const buildTestEnv = async () => {
  console.time("setup");
  // delete json file
  step_00();
  console.log("------------ step 00 done ------------ ");

  // deploy all mock erc20 tokens
  await step_01();
  console.log("------------ step 01 done ------------ ");

  // deploy all mock erc721 tokens
  await step_02();
  console.log("------------ step 02 done ------------ ");

  // deploy faucet
  await step_03();
  console.log("------------ step 03 done ------------ ");

  // deploy PoolAddressesProvider
  await step_04();
  console.log("------------ step 04 done ------------ ");

  // deploy ACLManager and setup ACLManager
  await step_05();
  console.log("------------ step 05 done ------------ ");

  // deploy PoolAddressesProviderRegistry
  await step_06();
  console.log("------------ step 06 done ------------ ");

  // deploy Pool
  await step_07();
  console.log("------------ step 07 done ------------ ");

  // deploy PoolConfigurator
  await step_08();
  console.log("------------ step 08 done ------------ ");

  // deploy ReservesSetupHelper
  await step_09();
  console.log("------------ step 09 done ------------ ");

  // deploy PriceOracle and set initial prices
  await step_10();
  console.log("------------ step 10 done ------------ ");

  // deploy mock aggregators, ParaSpaceOracle, ProtocolDataProvider, MockIncentivesController and UiPoolDataProvider
  await step_11();
  console.log("------------ step 11 done ------------ ");

  // deploy UiIncentiveDataProviderV3
  await step_12();
  console.log("------------ step 12 done ------------ ");

  // deploy wethGateway
  await step_13();
  console.log("------------ step 13 done ------------ ");

  // deploy wpunkGateway
  await step_14();
  console.log("------------ step 14 done ------------ ");

  // deploy uniswapV3Gateway
  await step_15();
  console.log("------------ step 15 done ------------ ");

  // deploy seaport
  await step_16();
  console.log("------------ step 16 done ------------ ");

  // deploy looksrare
  await step_17();
  console.log("------------ step 17 done ------------ ");

  // deploy x2y2
  await step_18();
  console.log("------------ step 18 done ------------ ");

  // deploy flash claim registry
  await step_19();
  console.log("------------ step 19 done ------------ ");

  console.timeEnd("setup");
};

export async function testEnvFixture() {
  await rawBRE.run("set-DRE");
  const FORK = process.env.FORK;

  if (FORK) {
    await rawBRE.run("paraspace:mainnet");
  } else {
    console.log("-> Deploying test environment...");
    await buildTestEnv();
    printContracts();
  }

  return await initializeMakeSuite();
}
