import {utils} from "ethers";
import {IInterestRateStrategyParams} from "../helpers/types";

////////////////////////////////////////////////////////////
// V1
////////////////////////////////////////////////////////////
export const rateStrategyDAI: IInterestRateStrategyParams = {
  name: "rateStrategyDAI",
  optimalUsageRatio: utils.parseUnits("0.8", 27).toString(),
  baseVariableBorrowRate: utils.parseUnits("0", 27).toString(),
  variableRateSlope1: utils.parseUnits("0.04", 27).toString(),
  variableRateSlope2: utils.parseUnits("0.75", 27).toString(),
};

export const rateStrategyUSDC: IInterestRateStrategyParams = {
  name: "rateStrategyUSDC",
  optimalUsageRatio: utils.parseUnits("0.9", 27).toString(),
  baseVariableBorrowRate: utils.parseUnits("0", 27).toString(),
  variableRateSlope1: utils.parseUnits("0.04", 27).toString(),
  variableRateSlope2: utils.parseUnits("0.60", 27).toString(),
};

export const rateStrategyUSDT: IInterestRateStrategyParams = {
  name: "rateStrategyUSDT",
  optimalUsageRatio: utils.parseUnits("0.9", 27).toString(),
  baseVariableBorrowRate: utils.parseUnits("0", 27).toString(),
  variableRateSlope1: utils.parseUnits("0.04", 27).toString(),
  variableRateSlope2: utils.parseUnits("0.75", 27).toString(),
};

export const rateStrategyWETH: IInterestRateStrategyParams = {
  name: "rateStrategyWETH",
  optimalUsageRatio: utils.parseUnits("0.7", 27).toString(),
  baseVariableBorrowRate: utils.parseUnits("0.025", 27).toString(),
  variableRateSlope1: utils.parseUnits("0.08", 27).toString(),
  variableRateSlope2: utils.parseUnits("0.9", 27).toString(),
};

export const rateStrategyWBTC: IInterestRateStrategyParams = {
  name: "rateStrategyWBTC",
  optimalUsageRatio: utils.parseUnits("0.65", 27).toString(),
  baseVariableBorrowRate: utils.parseUnits("0.025", 27).toString(),
  variableRateSlope1: utils.parseUnits("0.07", 27).toString(),
  variableRateSlope2: utils.parseUnits("1", 27).toString(),
};

export const rateStrategyAPE: IInterestRateStrategyParams = {
  name: "rateStrategyAPE",
  optimalUsageRatio: utils.parseUnits("0.85", 27).toString(),
  baseVariableBorrowRate: utils.parseUnits("0.40", 27).toString(),
  variableRateSlope1: utils.parseUnits("0.30", 27).toString(),
  variableRateSlope2: utils.parseUnits("2", 27).toString(),
};

export const rateStrategyNFT: IInterestRateStrategyParams = {
  name: "rateStrategyNFT",
  optimalUsageRatio: utils.parseUnits("0.45", 27).toString(),
  baseVariableBorrowRate: utils.parseUnits("0", 27).toString(),
  variableRateSlope1: utils.parseUnits("0.07", 27).toString(),
  variableRateSlope2: utils.parseUnits("3", 27).toString(),
};

////////////////////////////////////////////////////////////
// MOCK
////////////////////////////////////////////////////////////
// DAI USDT
export const rateStrategyStableTwo: IInterestRateStrategyParams = {
  name: "rateStrategyStableTwo",
  optimalUsageRatio: utils.parseUnits("0.8", 27).toString(),
  baseVariableBorrowRate: utils.parseUnits("0", 27).toString(),
  variableRateSlope1: utils.parseUnits("0.04", 27).toString(),
  variableRateSlope2: utils.parseUnits("0.75", 27).toString(),
};

// WETH stETH, Punk
export const rateStrategyXETH: IInterestRateStrategyParams = {
  name: "rateStrategyXETH",
  optimalUsageRatio: utils.parseUnits("0.65", 27).toString(),
  baseVariableBorrowRate: utils.parseUnits("0", 27).toString(),
  variableRateSlope1: utils.parseUnits("0.08", 27).toString(),
  variableRateSlope2: utils.parseUnits("1", 27).toString(),
};

// BAT ENJ LINK MANA MKR REN YFI ZRX
export const rateStrategyVolatileOne: IInterestRateStrategyParams = {
  name: "rateStrategyVolatileOne",
  optimalUsageRatio: utils.parseUnits("0.45", 27).toString(),
  baseVariableBorrowRate: utils.parseUnits("0", 27).toString(),
  variableRateSlope1: utils.parseUnits("0.07", 27).toString(),
  variableRateSlope2: utils.parseUnits("3", 27).toString(),
};
