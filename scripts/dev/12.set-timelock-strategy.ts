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
  wstETH: timeLockStrategyWSTETH,
  bendETH: timeLockStrategyBENDETH,
  awstETH: timeLockStrategyAWSTETH,
  aWETH: timeLockStrategyAWETH,
  cETH: timeLockStrategyCETH,
  PUNK: timeLockStrategyPUNK,
  WBTC: timeLockStrategyWBTC,
  APE: timeLockStrategyAPE,
  sAPE: timeLockStrategySAPE,
  cAPE: timeLockStrategyCAPE,
  yAPE: timeLockStrategyYAPE,
  xcDOT: timeLockStrategyXCDOT,
  WGLMR: timeLockStrategyWGLMR,
  BLUR: timeLockStrategyBLUR,
  BAYC: timeLockStrategyBAYC,
  MAYC: timeLockStrategyMAYC,
  BAKC: timeLockStrategyBAKC,
  DOODLES: timeLockStrategyDoodles,
  OTHR: timeLockStrategyOTHR,
  CLONEX: timeLockStrategyCloneX,
  MOONBIRD: timeLockStrategyMoonbird,
  MEEBITS: timeLockStrategyMeebits,
  AZUKI: timeLockStrategyAzuki,
  WPUNKS: timeLockStrategyWPunks,
  UniswapV3: timeLockStrategyUniswapV3,
  SEWER: timeLockStrategySEWER,
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
      continue;
    }

    console.log(x.symbol);
    const defaultStrategy = await deployReserveTimeLockStrategy(
      strategy.name,
      pool.address,
      strategy.minThreshold.toString(),
      strategy.midThreshold.toString(),
      strategy.minTime.toString(),
      strategy.midTime.toString(),
      strategy.maxTime.toString(),
      strategy.midThreshold.mul(10).toString(),
      strategy.poolPeriodWaitTime.toString(),
      strategy.period.toString()
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
