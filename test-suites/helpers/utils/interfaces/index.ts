import {BigNumber} from "ethers";

export interface UserReserveData {
  scaledPTokenBalance: BigNumber;
  currentPTokenBalance: BigNumber;
  currentStableDebt: BigNumber;
  currentVariableDebt: BigNumber;
  principalStableDebt: BigNumber;
  scaledVariableDebt: BigNumber;
  liquidityRate: BigNumber;
  stableBorrowRate: BigNumber;
  stableRateLastUpdated: BigNumber;
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
  totalLiquidity: BigNumber;
  totalStableDebt: BigNumber;
  totalVariableDebt: BigNumber;
  principalStableDebt: BigNumber;
  scaledVariableDebt: BigNumber;
  averageStableBorrowRate: BigNumber;
  variableBorrowRate: BigNumber;
  stableBorrowRate: BigNumber;
  supplyUtilizationRate: BigNumber;
  borrowUtilizationRate: BigNumber;
  liquidityIndex: BigNumber;
  variableBorrowIndex: BigNumber;
  xTokenAddress: string;
  marketStableRate: BigNumber;
  lastUpdateTimestamp: BigNumber;
  totalStableDebtLastUpdated: BigNumber;
  liquidityRate: BigNumber;
  accruedToTreasuryScaled: BigNumber;
  [key: string]: BigNumber | string;
}
