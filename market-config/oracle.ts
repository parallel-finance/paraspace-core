import {IOracleConfig} from "../helpers/types";

export const MainnetOracleConfig: IOracleConfig = {
  ExpirationPeriod: 1800,
  DeviationRate: 300,
  Nodes: [
    "0x487e74Fc85BAfFd0d99A34E7FBe3a60e3D75e8e9",
    "0x9950cA328112918A079DC5Ff9b4872Aac8fe5B64",
    "0x25Ff25F93a43a27216F99b4905598070Fb16c2cC",
    "0x8a763A6fAdb2E6D68e7D9a7dD3FFC5ec02Db8173",
  ],
};

export const TestnetOracleConfig: IOracleConfig = {
  ExpirationPeriod: 600,
  DeviationRate: 1000,
  Nodes: [],
};
