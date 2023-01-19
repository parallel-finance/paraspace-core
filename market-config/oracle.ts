import {BigNumber, constants} from "ethers";
import {ERC20TokenContractId, IOracleConfig} from "../helpers/types";

export const MainnetOracleConfig: IOracleConfig = {
  BaseCurrency: ERC20TokenContractId.WETH,
  BaseCurrencyUnit: constants.WeiPerEther.toString(),
  ExpirationPeriod: 1800,
  DeviationRate: 300,
  Nodes: [],
};

export const TestnetOracleConfig: IOracleConfig = {
  BaseCurrency: ERC20TokenContractId.WETH,
  BaseCurrencyUnit: constants.WeiPerEther.toString(),
  ExpirationPeriod: 600,
  DeviationRate: 1000,
  Nodes: [],
};

export const MoonbeamOracleConfig: IOracleConfig = {
  BaseCurrency: ERC20TokenContractId.USDC,
  BaseCurrencyUnit: BigNumber.from("100000000").toString(),
  ExpirationPeriod: 600,
  DeviationRate: 1000,
  Nodes: [],
};
