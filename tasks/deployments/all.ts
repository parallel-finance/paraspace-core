import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:all", "Deploy all contracts").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");

  const {printContracts} = await import("../../deploy/helpers/misc-utils");
  const {step_00} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/00_deleteDb"
  );
  const {step_01} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/01_ERC20Tokens"
  );
  const {step_02} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/02_ERC721Tokens"
  );
  const {step_03} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/03_faucet"
  );
  const {step_04} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/04_addressProvider"
  );
  const {step_05} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/05_aclManager"
  );
  const {step_06} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/06_pool"
  );
  const {step_07} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/07_poolConfigurator"
  );
  const {step_08} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/08_reservesSetupHelper"
  );
  const {step_09} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/09_fallbackOracle"
  );
  const {step_10} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/10_allAggregators"
  );
  const {step_11} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/11_allReserves"
  );
  const {step_12} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/12_uiIncentiveDataProvider"
  );
  const {step_13} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/13_wethGateway"
  );
  const {step_14} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/14_punkGateway"
  );
  const {step_15} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/15_seaport"
  );
  const {step_16} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/16_looksrare"
  );
  const {step_17} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/17_x2y2"
  );
  const {step_18} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps/18_flashClaimRegistry"
  );

  console.time("setup");
  // delete json file
  step_00();
  console.log("------------ step 00 done ------------ ");

  // deploy all mock erc20 tokens
  await step_01(verify);
  console.log("------------ step 01 done ------------ ");

  // deploy all mock erc721 tokens
  await step_02(verify);
  console.log("------------ step 02 done ------------ ");

  // deploy faucet
  await step_03(verify);
  console.log("------------ step 03 done ------------ ");

  // deploy PoolAddressesProvider
  await step_04(verify);
  console.log("------------ step 04 done ------------ ");

  // deploy ACLManager and setup ACLManager
  await step_05(verify);
  console.log("------------ step 05 done ------------ ");

  // deploy Pool
  await step_06(verify);
  console.log("------------ step 06 done ------------ ");

  // deploy PoolConfigurator
  await step_07(verify);
  console.log("------------ step 07 done ------------ ");

  // deploy ReservesSetupHelper
  await step_08(verify);
  console.log("------------ step 08 done ------------ ");

  // deploy PriceOracle and set initial prices
  await step_09(verify);
  console.log("------------ step 09 done ------------ ");

  // deploy mock aggregators, ParaSpaceOracle, ProtocolDataProvider and UiPoolDataProvider
  await step_10(verify);
  console.log("------------ step 10 done ------------ ");

  // deploy MockIncentivesController, mockReserveAuctionStrategy and reserves
  await step_11(verify);
  console.log("------------ step 11 done ------------ ");

  // deploy UiIncentiveDataProviderV3
  await step_12(verify);
  console.log("------------ step 12 done ------------ ");

  // deploy wethGateway
  await step_13(verify);
  console.log("------------ step 13 done ------------ ");

  // deploy wpunkGateway
  await step_14(verify);
  console.log("------------ step 14 done ------------ ");

  // deploy seaport
  await step_15(verify);
  console.log("------------ step 15 done ------------ ");

  // deploy looksrare
  await step_16(verify);
  console.log("------------ step 16 done ------------ ");

  // deploy x2y2
  await step_17(verify);
  console.log("------------ step 17 done ------------ ");

  // deploy flash claim registry
  await step_18(verify);
  console.log("------------ step 18 done ------------ ");

  await printContracts();

  console.timeEnd("setup");
});
