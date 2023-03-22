import {parseUnits} from "ethers/lib/utils";
import {ITimeLockStrategyParams} from "../helpers/types";

export const timeLockStrategyUSDC: ITimeLockStrategyParams = {
  name: "timeLockStrategyUSDC",
  minThreshold: parseUnits("1000", 6).toString(),
  midThreshold: parseUnits("5000", 6).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyUSDT: ITimeLockStrategyParams = {
  name: "timeLockStrategyUSDT",
  minThreshold: parseUnits("1000", 6).toString(),
  midThreshold: parseUnits("5000", 6).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyDAI: ITimeLockStrategyParams = {
  name: "timeLockStrategyDAI",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyFRAX: ITimeLockStrategyParams = {
  name: "timeLockStrategyFRAX",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyWETH: ITimeLockStrategyParams = {
  name: "timeLockStrategyWETH",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyCBETH: ITimeLockStrategyParams = {
  name: "timeLockStrategyCBETH",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyRETH: ITimeLockStrategyParams = {
  name: "timeLockStrategyRETH",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyASTETH: ITimeLockStrategyParams = {
  name: "timeLockStrategyASTETH",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyWSTETH: ITimeLockStrategyParams = {
  name: "timeLockStrategyWSTETH",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyBENDETH: ITimeLockStrategyParams = {
  name: "timeLockStrategyBENDETH",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyAWSTETH: ITimeLockStrategyParams = {
  name: "timeLockStrategyAWSTETH",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyAWETH: ITimeLockStrategyParams = {
  name: "timeLockStrategyAWETH",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyCETH: ITimeLockStrategyParams = {
  name: "timeLockStrategyCETH",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyPUNK: ITimeLockStrategyParams = {
  name: "timeLockStrategyPUNK",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyWBTC: ITimeLockStrategyParams = {
  name: "timeLockStrategyWBTC",
  minThreshold: parseUnits("1000", 8).toString(),
  midThreshold: parseUnits("5000", 8).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyAPE: ITimeLockStrategyParams = {
  name: "timeLockStrategyAPE",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategySAPE: ITimeLockStrategyParams = {
  name: "timeLockStrategySAPE",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyCAPE: ITimeLockStrategyParams = {
  name: "timeLockStrategyCAPE",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyYAPE: ITimeLockStrategyParams = {
  name: "timeLockStrategyYAPE",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyXCDOT: ITimeLockStrategyParams = {
  name: "timeLockStrategyXCDOT",
  minThreshold: parseUnits("1000", 10).toString(),
  midThreshold: parseUnits("5000", 10).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyWGLMR: ITimeLockStrategyParams = {
  name: "timeLockStrategyWGLMR",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyBLUR: ITimeLockStrategyParams = {
  name: "timeLockStrategyBLUR",
  minThreshold: parseUnits("1000", 18).toString(),
  midThreshold: parseUnits("5000", 18).toString(),
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyBAYC: ITimeLockStrategyParams = {
  name: "timeLockStrategyBAYC",
  minThreshold: "5",
  midThreshold: "10",
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyMAYC: ITimeLockStrategyParams = {
  name: "timeLockStrategyMAYC",
  minThreshold: "5",
  midThreshold: "10",
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyBAKC: ITimeLockStrategyParams = {
  name: "timeLockStrategyBAKC",
  minThreshold: "5",
  midThreshold: "10",
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyDoodles: ITimeLockStrategyParams = {
  name: "timeLockStrategyDoodles",
  minThreshold: "5",
  midThreshold: "10",
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyOTHR: ITimeLockStrategyParams = {
  name: "timeLockStrategyOTHR",
  minThreshold: "5",
  midThreshold: "10",
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyCloneX: ITimeLockStrategyParams = {
  name: "timeLockStrategyCloneX",
  minThreshold: "5",
  midThreshold: "10",
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyMoonbird: ITimeLockStrategyParams = {
  name: "timeLockStrategyMoonbird",
  minThreshold: "5",
  midThreshold: "10",
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyMeebits: ITimeLockStrategyParams = {
  name: "timeLockStrategyMeebits",
  minThreshold: "5",
  midThreshold: "10",
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyAzuki: ITimeLockStrategyParams = {
  name: "timeLockStrategyAzuki",
  minThreshold: "5",
  midThreshold: "10",
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyWPunks: ITimeLockStrategyParams = {
  name: "timeLockStrategyWPunks",
  minThreshold: "5",
  midThreshold: "10",
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyUniswapV3: ITimeLockStrategyParams = {
  name: "timeLockStrategyUniswapV3",
  minThreshold: "5",
  midThreshold: "10",
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategySEWER: ITimeLockStrategyParams = {
  name: "timeLockStrategySEWER",
  minThreshold: "5",
  midThreshold: "10",
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};

export const timeLockStrategyPenguins: ITimeLockStrategyParams = {
  name: "timeLockStrategyPenguins",
  minThreshold: "5",
  midThreshold: "10",
  minWaitTime: "5",
  midWaitTime: "300",
  maxWaitTime: "3600",
  poolPeriodWaitTime: "40",
  poolPeriodLimit: "100",
  period: "86400",
};
