import rawBRE from "hardhat";
import {printContracts} from "../deploy/helpers/misc-utils";
import {initializeMakeSuite} from "./helpers/make-suite";
import {step_00} from "../deploy/tasks/deployments/testnet/steps/00_deleteDb";
import {step_0A} from "../deploy/tasks/deployments/testnet/steps/0A_mockERC20Tokens";
import {step_0B} from "../deploy/tasks/deployments/testnet/steps/0B_mockERC721Tokens";
import {step_01} from "../deploy/tasks/deployments/testnet/steps/01_faucet";
import {step_02} from "../deploy/tasks/deployments/testnet/steps/02_addressProvider";
import {step_03} from "../deploy/tasks/deployments/testnet/steps/03_aclManager";
import {step_04} from "../deploy/tasks/deployments/testnet/steps/04_poolAddressesProviderRegistry";
import {step_05} from "../deploy/tasks/deployments/testnet/steps/05_pool";
import {step_06} from "../deploy/tasks/deployments/testnet/steps/06_poolConfigurator";
import {step_07} from "../deploy/tasks/deployments/testnet/steps/07_reservesSetupHelper";
import {step_08} from "../deploy/tasks/deployments/testnet/steps/08_priceOracle";
import {step_09} from "../deploy/tasks/deployments/testnet/steps/09_allMockAggregators";
import {step_10} from "../deploy/tasks/deployments/testnet/steps/10_uiIncentiveDataProvider";
import {step_11} from "../deploy/tasks/deployments/testnet/steps/11_wethGateway";
import {step_12} from "../deploy/tasks/deployments/testnet/steps/12_punkGateway";
import {step_13} from "../deploy/tasks/deployments/testnet/steps/13_moonbirdsGateway";
import {step_14} from "../deploy/tasks/deployments/testnet/steps/14_uniswapV3Gateway";
import {step_15} from "../deploy/tasks/deployments/testnet/steps/15_seaport";
import {step_16} from "../deploy/tasks/deployments/testnet/steps/16_looksrare";
import {step_17} from "../deploy/tasks/deployments/testnet/steps/17_x2y2";
import {step_18} from "../deploy/tasks/deployments/testnet/steps/18_flashClaimRegistry";

const buildTestEnv = async () => {
  console.time("setup");
  // delete json file
  step_00();
  console.log("------------ step 00 done ------------ ");

  // deploy all mock erc20 tokens
  await step_0A();
  console.log("------------ step 0A done ------------ ");

  // deploy all mock erc721 tokens
  await step_0B();
  console.log("------------ step 0B done ------------ ");

  // deploy faucet
  await step_01();
  console.log("------------ step 01 done ------------ ");

  // deploy PoolAddressesProvider
  await step_02();
  console.log("------------ step 02 done ------------ ");

  // deploy ACLManager and setup ACLManager
  await step_03();
  console.log("------------ step 03 done ------------ ");

  // deploy PoolAddressesProviderRegistry
  await step_04();
  console.log("------------ step 04 done ------------ ");

  // deploy Pool
  await step_05();
  console.log("------------ step 05 done ------------ ");

  // deploy PoolConfigurator
  await step_06();
  console.log("------------ step 06 done ------------ ");

  // deploy ReservesSetupHelper
  await step_07();
  console.log("------------ step 07 done ------------ ");

  // deploy PriceOracle and set initial prices
  await step_08();
  console.log("------------ step 08 done ------------ ");

  // deploy mock aggregators, ParaSpaceOracle, ProtocolDataProvider, MockIncentivesController and UiPoolDataProvider
  await step_09();
  console.log("------------ step 09 done ------------ ");

  // deploy UiIncentiveDataProviderV3
  await step_10();
  console.log("------------ step 10 done ------------ ");

  // deploy wethGateway
  await step_11();
  console.log("------------ step 11 done ------------ ");

  // deploy wpunkGateway
  await step_12();
  console.log("------------ step 12 done ------------ ");

  // deploy moonbirdsGateway
  await step_13();
  console.log("------------ step 13 done ------------ ");

  // deploy uniswapV3Gateway
  await step_14();
  console.log("------------ step 14 done ------------ ");

  // deploy seaport
  await step_15();
  console.log("------------ step 15 done ------------ ");

  // deploy looksrare
  await step_16();
  console.log("------------ step 16 done ------------ ");

  // deploy x2y2
  await step_17();
  console.log("------------ step 17 done ------------ ");

  // deploy flash claim registry
  await step_18();
  console.log("------------ step 18 done ------------ ");

  console.timeEnd("setup");
};

before(async () => {
  await rawBRE.run("set-DRE");
  const FORK = process.env.FORK;

  if (FORK) {
    await rawBRE.run("paraspace:mainnet");
  } else {
    console.log("-> Deploying test environment...");
    await buildTestEnv();
    printContracts();
  }

  console.log("initialize make suite");
  await initializeMakeSuite();
  console.log("\n***************");
  console.log("Setup and snapshot finished");
  console.log("***************\n");
});
