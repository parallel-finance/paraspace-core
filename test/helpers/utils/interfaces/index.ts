import {BigNumber} from "ethers";

export interface UserReserveData {
  scaledPTokenBalance: BigNumber;
  currentPTokenBalance: BigNumber;
  currentVariableDebt: BigNumber;
  scaledVariableDebt: BigNumber;
  liquidityRate: BigNumber;
  usageAsCollateralEnabled: boolean;
  walletBalance: BigNumber;
  [key: string]: BigNumber | string | boolean;
}

export interface ReserveData {
  address: string;
  symbol: string;
  decimals: BigNumber;
  reserveFactor: BigNumber;
  availableLiquidity: BigNumber;
  totalVariableDebt: BigNumber;
  scaledVariableDebt: BigNumber;
  variableBorrowRate: BigNumber;
  supplyUtilizationRate: BigNumber;
  borrowUtilizationRate: BigNumber;
  liquidityIndex: BigNumber;
  variableBorrowIndex: BigNumber;
  xTokenAddress: string;
  lastUpdateTimestamp: BigNumber;
  liquidityRate: BigNumber;
  accruedToTreasuryScaled: BigNumber;
  [key: string]: BigNumber | string;
}
