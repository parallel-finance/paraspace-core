import {BigNumber, constants} from "ethers";
import {ZERO_ADDRESS} from "../helpers/constants";
import {ERC20TokenContractId, IOracleConfig} from "../helpers/types";

export const MainnetOracleConfig: IOracleConfig = {
  BaseCurrency: ERC20TokenContractId.WETH,
  BaseCurrencyUnit: constants.WeiPerEther,
  BaseCurrencyDecimals: 18,
  ExpirationPeriod: 1800,
  DeviationRate: 300,
  Nodes: [],
};

export const MoonbeamOracleConfig: IOracleConfig = {
  BaseCurrency: ERC20TokenContractId.USDC,
  BaseCurrencyUnit: BigNumber.from("100000000"),
  BaseCurrencyDecimals: 8,
  ExpirationPeriod: 600,
  DeviationRate: 1000,
  Nodes: [],
};

export const ArbitrumOneOracleConfig: IOracleConfig = {
  BaseCurrency: ZERO_ADDRESS,
  BaseCurrencyUnit: BigNumber.from("100000000"),
  BaseCurrencyDecimals: 8,
  ExpirationPeriod: 600,
  DeviationRate: 1000,
  Nodes: [],
};

////////////////////////////////////////////////////////////////////////////////
// Testnet
////////////////////////////////////////////////////////////////////////////////
export const TestnetOracleConfig: IOracleConfig = {
  BaseCurrency: ERC20TokenContractId.WETH,
  BaseCurrencyUnit: constants.WeiPerEther,
  BaseCurrencyDecimals: 18,
  ExpirationPeriod: 600,
  DeviationRate: 1000,
  Nodes: [],
};
