import {eContractid, IReserveParams} from "../helpers/types";
import {
  rateStrategyXETH,
  rateStrategyWBTC,
  rateStrategyAPE,
  rateStrategyNFT,
  rateStrategyDAI,
  rateStrategyUSDC,
  rateStrategyUSDT,
  rateStrategyWETH,
  rateStrategyXCDOT,
  rateStrategyWGLMR,
} from "./rateStrategies";
import {
  auctionStrategyAzuki,
  auctionStrategyBAKC,
  auctionStrategyBAYC,
  auctionStrategyCloneX,
  auctionStrategyDoodles,
  auctionStrategyMAYC,
  auctionStrategyMeebits,
  auctionStrategyMoonbird,
  auctionStrategyOthr,
  auctionStrategyUniswapV3,
  auctionStrategyWPunks,
  auctionStrategyZero,
} from "./auctionStrategies";

////////////////////////////////////////////////////////////
// V1
////////////////////////////////////////////////////////////
export const strategyDAI: IReserveParams = {
  strategy: rateStrategyDAI,
  auctionStrategy: auctionStrategyZero,
  baseLTVAsCollateral: "7700",
  liquidationThreshold: "9000",
  liquidationProtocolFeePercentage: "0",
  liquidationBonus: "10400",
  borrowingEnabled: true,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PTokenImpl,
  reserveFactor: "1000",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyUSDC: IReserveParams = {
  strategy: rateStrategyUSDC,
  auctionStrategy: auctionStrategyZero,
  baseLTVAsCollateral: "8700",
  liquidationThreshold: "8900",
  liquidationProtocolFeePercentage: "0",
  liquidationBonus: "10450",
  borrowingEnabled: true,
  reserveDecimals: "6",
  xTokenImpl: eContractid.PTokenImpl,
  reserveFactor: "1000",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyUSDT: IReserveParams = {
  strategy: rateStrategyUSDT,
  auctionStrategy: auctionStrategyZero,
  baseLTVAsCollateral: "7500",
  liquidationThreshold: "8000",
  liquidationProtocolFeePercentage: "0",
  liquidationBonus: "10500",
  borrowingEnabled: true,
  reserveDecimals: "6",
  xTokenImpl: eContractid.PTokenImpl,
  reserveFactor: "1000",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyWETH: IReserveParams = {
  strategy: rateStrategyWETH,
  auctionStrategy: auctionStrategyZero,
  baseLTVAsCollateral: "8250",
  liquidationThreshold: "8600",
  liquidationProtocolFeePercentage: "0",
  liquidationBonus: "10450",
  borrowingEnabled: true,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PTokenImpl,
  reserveFactor: "1000",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyWBTC: IReserveParams = {
  strategy: rateStrategyWBTC,
  auctionStrategy: auctionStrategyZero,
  baseLTVAsCollateral: "7200",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "8200",
  liquidationBonus: "10500",
  borrowingEnabled: true,
  reserveDecimals: "8",
  xTokenImpl: eContractid.PTokenImpl,
  reserveFactor: "2000",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyAPE: IReserveParams = {
  strategy: rateStrategyAPE,
  auctionStrategy: auctionStrategyZero,
  baseLTVAsCollateral: "2000",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "7000",
  liquidationBonus: "10500",
  borrowingEnabled: true,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PTokenImpl,
  reserveFactor: "250",
  borrowCap: "0",
  supplyCap: "18062500",
};

export const strategySAPE: IReserveParams = {
  strategy: rateStrategyAPE,
  auctionStrategy: auctionStrategyZero,
  baseLTVAsCollateral: "2000",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "7000",
  liquidationBonus: "10500",
  borrowingEnabled: false,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PTokenSApeImpl,
  reserveFactor: "250",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyCAPE: IReserveParams = {
  strategy: rateStrategyAPE,
  auctionStrategy: auctionStrategyZero,
  baseLTVAsCollateral: "2000",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "7000",
  liquidationBonus: "10500",
  borrowingEnabled: true,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PTokenCApeImpl,
  reserveFactor: "1000",
  borrowCap: "0",
  supplyCap: "18062500",
};

export const strategyXCDOT: IReserveParams = {
  strategy: rateStrategyXCDOT,
  auctionStrategy: auctionStrategyZero,
  baseLTVAsCollateral: "6000",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "7000",
  liquidationBonus: "10500",
  borrowingEnabled: true,
  reserveDecimals: "10",
  xTokenImpl: eContractid.PTokenImpl,
  reserveFactor: "1000",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyWGLMR: IReserveParams = {
  strategy: rateStrategyWGLMR,
  auctionStrategy: auctionStrategyZero,
  baseLTVAsCollateral: "3000",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "4500",
  liquidationBonus: "10500",
  borrowingEnabled: true,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PTokenImpl,
  reserveFactor: "1000",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyBAYC: IReserveParams = {
  strategy: rateStrategyNFT,
  auctionStrategy: auctionStrategyBAYC,
  baseLTVAsCollateral: "4000",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "8000",
  liquidationBonus: "10500",
  borrowingEnabled: false,
  reserveDecimals: "0",
  xTokenImpl: eContractid.NTokenBAYCImpl,
  reserveFactor: "0",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyMAYC: IReserveParams = {
  strategy: rateStrategyNFT,
  auctionStrategy: auctionStrategyMAYC,
  baseLTVAsCollateral: "3250",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "7000",
  liquidationBonus: "10500",
  borrowingEnabled: false,
  reserveDecimals: "0",
  xTokenImpl: eContractid.NTokenMAYCImpl,
  reserveFactor: "0",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyBAKC: IReserveParams = {
  strategy: rateStrategyNFT,
  auctionStrategy: auctionStrategyBAKC,
  baseLTVAsCollateral: "4000",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "8000",
  liquidationBonus: "10500",
  borrowingEnabled: false,
  reserveDecimals: "0",
  xTokenImpl: eContractid.NTokenBAKCImpl,
  reserveFactor: "0",
  borrowCap: "0",
  supplyCap: "1000",
};

export const strategyDoodles: IReserveParams = {
  strategy: rateStrategyNFT,
  auctionStrategy: auctionStrategyDoodles,
  baseLTVAsCollateral: "3000",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "6500",
  liquidationBonus: "10500",
  borrowingEnabled: false,
  reserveDecimals: "0",
  xTokenImpl: eContractid.NTokenImpl,
  reserveFactor: "0",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyOthr: IReserveParams = {
  strategy: rateStrategyNFT,
  auctionStrategy: auctionStrategyOthr,
  baseLTVAsCollateral: "3000",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "6500",
  liquidationBonus: "10500",
  borrowingEnabled: false,
  reserveDecimals: "0",
  xTokenImpl: eContractid.NTokenImpl,
  reserveFactor: "0",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyClonex: IReserveParams = {
  strategy: rateStrategyNFT,
  auctionStrategy: auctionStrategyCloneX,
  baseLTVAsCollateral: "3000",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "6500",
  liquidationBonus: "10500",
  borrowingEnabled: false,
  reserveDecimals: "0",
  xTokenImpl: eContractid.NTokenImpl,
  reserveFactor: "0",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyMoonbird: IReserveParams = {
  strategy: rateStrategyNFT,
  auctionStrategy: auctionStrategyMoonbird,
  baseLTVAsCollateral: "3000",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "6500",
  liquidationBonus: "10500",
  borrowingEnabled: false,
  reserveDecimals: "0",
  xTokenImpl: eContractid.NTokenMoonBirdsImpl,
  reserveFactor: "0",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyMeebits: IReserveParams = {
  strategy: rateStrategyNFT,
  auctionStrategy: auctionStrategyMeebits,
  baseLTVAsCollateral: "3000",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "6500",
  liquidationBonus: "10500",
  borrowingEnabled: false,
  reserveDecimals: "0",
  xTokenImpl: eContractid.NTokenImpl,
  reserveFactor: "0",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyAzuki: IReserveParams = {
  strategy: rateStrategyNFT,
  auctionStrategy: auctionStrategyAzuki,
  baseLTVAsCollateral: "3000",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "6500",
  liquidationBonus: "10500",
  borrowingEnabled: false,
  reserveDecimals: "0",
  xTokenImpl: eContractid.NTokenImpl,
  reserveFactor: "0",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyWPunks: IReserveParams = {
  strategy: rateStrategyNFT,
  auctionStrategy: auctionStrategyWPunks,
  baseLTVAsCollateral: "3500",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "7000",
  liquidationBonus: "10500",
  borrowingEnabled: false,
  reserveDecimals: "0",
  xTokenImpl: eContractid.NTokenImpl,
  reserveFactor: "0",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyUniswapV3: IReserveParams = {
  strategy: rateStrategyNFT,
  auctionStrategy: auctionStrategyUniswapV3,
  baseLTVAsCollateral: "3000",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "7000",
  liquidationBonus: "10500",
  borrowingEnabled: false,
  reserveDecimals: "0",
  xTokenImpl: eContractid.NTokenUniswapV3Impl,
  reserveFactor: "0",
  borrowCap: "0",
  supplyCap: "0",
};

////////////////////////////////////////////////////////////
// V2
////////////////////////////////////////////////////////////
export const strategySTETH: IReserveParams = {
  strategy: rateStrategyXETH,
  auctionStrategy: auctionStrategyZero,
  baseLTVAsCollateral: "6900",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "8100",
  liquidationBonus: "10750",
  borrowingEnabled: true,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PTokenStETHImpl,
  reserveFactor: "1000",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyAWETH: IReserveParams = {
  strategy: rateStrategyXETH,
  auctionStrategy: auctionStrategyZero,
  baseLTVAsCollateral: "6900",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "8100",
  liquidationBonus: "10750",
  borrowingEnabled: true,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PTokenATokenImpl,
  reserveFactor: "1000",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyCETH: IReserveParams = {
  strategy: rateStrategyXETH,
  auctionStrategy: auctionStrategyZero,
  baseLTVAsCollateral: "6900",
  liquidationThreshold: "8100",
  liquidationProtocolFeePercentage: "0",
  liquidationBonus: "10750",
  borrowingEnabled: true,
  reserveDecimals: "8",
  xTokenImpl: eContractid.PTokenImpl,
  reserveFactor: "1000",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyPUNK: IReserveParams = {
  // address: "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB",
  strategy: rateStrategyXETH,
  auctionStrategy: auctionStrategyZero,
  baseLTVAsCollateral: "6900",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "8100",
  liquidationBonus: "10750",
  borrowingEnabled: true,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PTokenImpl,
  reserveFactor: "1000",
  borrowCap: "0",
  supplyCap: "0",
};
