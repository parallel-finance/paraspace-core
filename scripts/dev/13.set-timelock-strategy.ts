import rawBRE from "hardhat";
import {deployReserveTimeLockStrategy as deployReserveTimeLockStrategy} from "../../helpers/contracts-deployments";
import {
  getPoolConfiguratorProxy,
  getPoolProxy,
  getProtocolDataProvider,
} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

import {
  timeLockStrategyUSDC,
  timeLockStrategyUSDT,
  timeLockStrategyDAI,
  timeLockStrategyFRAX,
  timeLockStrategyWETH,
  timeLockStrategyCBETH,
  timeLockStrategyRETH,
  timeLockStrategyASTETH,
  timeLockStrategyWSTETH,
  timeLockStrategyBENDETH,
  timeLockStrategyAWSTETH,
  timeLockStrategyAWETH,
  timeLockStrategyCETH,
  timeLockStrategyPUNK,
  timeLockStrategyWBTC,
  timeLockStrategyAPE,
  timeLockStrategySAPE,
  timeLockStrategyCAPE,
  timeLockStrategyYAPE,
  timeLockStrategyXCDOT,
  timeLockStrategyWGLMR,
  timeLockStrategyBLUR,
  timeLockStrategyBAYC,
  timeLockStrategyMAYC,
  timeLockStrategyBAKC,
  timeLockStrategyDoodles,
  timeLockStrategyOTHR,
  timeLockStrategyCloneX,
  timeLockStrategyMoonbird,
  timeLockStrategyMeebits,
  timeLockStrategyAzuki,
  timeLockStrategyWPunks,
  timeLockStrategyUniswapV3,
  timeLockStrategySEWER,
  timeLockStrategyPenguins,
  timeLockStrategySTETH,
} from "../../market-config/timeLockStrategies";

const TIME_LOCK_STRATEGY = {
  USDC: timeLockStrategyUSDC,
  USDT: timeLockStrategyUSDT,
  DAI: timeLockStrategyDAI,
  FRAX: timeLockStrategyFRAX,
  WETH: timeLockStrategyWETH,
  cbETH: timeLockStrategyCBETH,
  rETH: timeLockStrategyRETH,
  astETH: timeLockStrategyASTETH,
  stETH: timeLockStrategySTETH,
  wstETH: timeLockStrategyWSTETH,
  bendETH: timeLockStrategyBENDETH,
  bendWETH: timeLockStrategyBENDETH,
  awstETH: timeLockStrategyAWSTETH,
  aWETH: timeLockStrategyAWETH,
  aEthWETH: timeLockStrategyAWETH,
  cETH: timeLockStrategyCETH,
  PUNK: timeLockStrategyPUNK,
  WBTC: timeLockStrategyWBTC,
  APE: timeLockStrategyAPE,
  M20: timeLockStrategyAPE,
  sAPE: timeLockStrategySAPE,
  SAPE: timeLockStrategySAPE,
  SApe: timeLockStrategySAPE,
  cAPE: timeLockStrategyCAPE,
  yAPE: timeLockStrategyYAPE,
  xcDOT: timeLockStrategyXCDOT,
  WGLMR: timeLockStrategyWGLMR,
  BLUR: timeLockStrategyBLUR,
  BAYC: timeLockStrategyBAYC,
  ATK: timeLockStrategyBAYC,
  MAYC: timeLockStrategyMAYC,
  BTK: timeLockStrategyMAYC,
  BAKC: timeLockStrategyBAKC,
  GTK: timeLockStrategyBAKC,
  DOODLES: timeLockStrategyDoodles,
  DOODLE: timeLockStrategyDoodles,
  OTHR: timeLockStrategyOTHR,
  CLONEX: timeLockStrategyCloneX,
  Clonex: timeLockStrategyCloneX,
  CloneX: timeLockStrategyCloneX,
  MOONBIRD: timeLockStrategyMoonbird,
  MEEBITS: timeLockStrategyMeebits,
  "⚇": timeLockStrategyMeebits,
  AZUKI: timeLockStrategyAzuki,
  WPUNKS: timeLockStrategyWPunks,
  UniswapV3: timeLockStrategyUniswapV3,
  "UNI-V3-POS": timeLockStrategyUniswapV3,
  SEWER: timeLockStrategySEWER,
  SewerPass: timeLockStrategySEWER,
  PPG: timeLockStrategyPenguins,
};

const setTimeLockStrategy = async () => {
  console.time("set-timelock-strategy");

  const ui = await getProtocolDataProvider();
  const pool = await getPoolProxy();
  const configurator = await getPoolConfiguratorProxy();
  const reservesData = await ui.getAllReservesTokens();
  for (const x of reservesData) {
    const strategy = TIME_LOCK_STRATEGY[x.symbol];
    if (!strategy) {
      console.log("no stratey found for", x.symbol);
      continue;
    }

    console.log(x.symbol);
    const defaultStrategy = await deployReserveTimeLockStrategy(
      strategy.name,
      pool.address,
      strategy.minThreshold,
      strategy.midThreshold,
      strategy.minWaitTime,
      strategy.midWaitTime,
      strategy.maxWaitTime,
      strategy.poolPeriodLimit,
      strategy.poolPeriodWaitTime,
      strategy.period
    );

    if (DRY_RUN) {
      const encodedData = configurator.interface.encodeFunctionData(
        "setReserveTimeLockStrategyAddress",
        [x.tokenAddress, defaultStrategy.address]
      );
      await dryRunEncodedData(configurator.address, encodedData);
    } else {
      await waitForTx(
        await configurator.setReserveTimeLockStrategyAddress(
          x.tokenAddress,
          defaultStrategy.address,
          GLOBAL_OVERRIDES
        )
      );
    }
  }
  console.timeEnd("set-timelock-strategy");
};

async function main() {
  await rawBRE.run("set-DRE");
  await setTimeLockStrategy();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
