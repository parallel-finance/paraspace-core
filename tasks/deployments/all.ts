import {task} from "hardhat/config";
import {printContracts} from "../../deploy/helpers/misc-utils";
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
import {step_15} from "../../deploy/tasks/deployments/testnet/steps/15_moonbirdsGateway";
import {step_16} from "../../deploy/tasks/deployments/testnet/steps/16_uniswapV3Gateway";
import {step_17} from "../../deploy/tasks/deployments/testnet/steps/17_seaport";
import {step_18} from "../../deploy/tasks/deployments/testnet/steps/18_looksrare";
import {step_19} from "../../deploy/tasks/deployments/testnet/steps/19_x2y2";
import {step_20} from "../../deploy/tasks/deployments/testnet/steps/20_flashClaimRegistry";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;

task("deploy:all", "Deploy all contracts")
  .setAction(async (_, DRE) => {
    await DRE.run("set-DRE")
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

    // deploy PoolAddressesProviderRegistry
    await step_06(verify);
    console.log("------------ step 06 done ------------ ");

    // deploy Pool
    await step_07(verify);
    console.log("------------ step 07 done ------------ ");

    // deploy PoolConfigurator
    await step_08(verify);
    console.log("------------ step 08 done ------------ ");

    // deploy ReservesSetupHelper
    await step_09(verify);
    console.log("------------ step 09 done ------------ ");

    // deploy PriceOracle and set initial prices
    await step_10(verify);
    console.log("------------ step 10 done ------------ ");

    // deploy mock aggregators, ParaSpaceOracle, ProtocolDataProvider, MockIncentivesController and UiPoolDataProvider
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

    // deploy moonbirdsGateway
    await step_15(verify);
    console.log("------------ step 15 done ------------ ");

    // deploy uniswapV3Gateway
    await step_16(verify);
    console.log("------------ step 16 done ------------ ");

    // deploy seaport
    await step_17(verify);
    console.log("------------ step 17 done ------------ ");

    // deploy looksrare
    await step_18(verify);
    console.log("------------ step 18 done ------------ ");

    // deploy x2y2
    await step_19(verify);
    console.log("------------ step 19 done ------------ ");

    // deploy flash claim registry
    await step_20(verify);
    console.log("------------ step 20 done ------------ ");

    console.timeEnd("setup");
  })
