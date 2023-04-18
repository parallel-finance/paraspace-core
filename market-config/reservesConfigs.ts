import {eContractid, IReserveParams} from "../helpers/types";
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
  auctionStrategyPudgyPenguins,
  auctionStrategySEWER,
  auctionStrategyStakefishValidator,
  auctionStrategyUniswapV3,
  auctionStrategyWPunks,
  auctionStrategyZero,
} from "./auctionStrategies";
import {
  rateStrategyAPE,
  rateStrategyBLUR,
  rateStrategyDAI,
  rateStrategyFRAX,
  rateStrategyNFT,
  rateStrategyUSDC,
  rateStrategyUSDT,
  rateStrategyWBTC,
  rateStrategyWETH,
  rateStrategyWGLMR,
  rateStrategyXCDOT,
  rateStrategyXETH,
} from "./rateStrategies";
import {
  timeLockStrategyAPE,
  timeLockStrategyASTETH,
  timeLockStrategyAWETH,
  timeLockStrategyAWSTETH,
  timeLockStrategyAzuki,
  timeLockStrategyBAKC,
  timeLockStrategyBAYC,
  timeLockStrategyBENDETH,
  timeLockStrategyBLUR,
  timeLockStrategyCAPE,
  timeLockStrategyCETH,
  timeLockStrategyCloneX,
  timeLockStrategyDAI,
  timeLockStrategyDoodles,
  timeLockStrategyFRAX,
  timeLockStrategyMAYC,
  timeLockStrategyMeebits,
  timeLockStrategyMoonbird,
  timeLockStrategyOTHR,
  timeLockStrategyPenguins,
  timeLockStrategyPUNK,
  timeLockStrategyRETH,
  timeLockStrategySAPE,
  timeLockStrategySEWER,
  timeLockStrategyStakefishValidator,
  timeLockStrategyUniswapV3,
  timeLockStrategyUSDC,
  timeLockStrategyUSDT,
  timeLockStrategyWBTC,
  timeLockStrategyWETH,
  timeLockStrategyWGLMR,
  timeLockStrategyWPunks,
  timeLockStrategyWSTETH,
  timeLockStrategyXCDOT,
  timeLockStrategyYAPE,
} from "./timeLockStrategies";

////////////////////////////////////////////////////////////
// V1
////////////////////////////////////////////////////////////
export const strategyDAI: IReserveParams = {
  strategy: rateStrategyDAI,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyDAI,
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
  timeLockStrategy: timeLockStrategyUSDC,
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
  timeLockStrategy: timeLockStrategyUSDT,
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

export const strategyFRAX: IReserveParams = {
  strategy: rateStrategyFRAX,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyFRAX,
  baseLTVAsCollateral: "7500",
  liquidationThreshold: "8000",
  liquidationProtocolFeePercentage: "0",
  liquidationBonus: "10500",
  borrowingEnabled: true,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PTokenImpl,
  reserveFactor: "1000",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyWETH: IReserveParams = {
  strategy: rateStrategyWETH,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyWETH,
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
  timeLockStrategy: timeLockStrategyWBTC,
  baseLTVAsCollateral: "7200",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "8200",
  liquidationBonus: "10500",
  borrowingEnabled: true,
  reserveDecimals: "8",
  xTokenImpl: eContractid.PTokenImpl,
  reserveFactor: "1000",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyAPE: IReserveParams = {
  strategy: rateStrategyAPE,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyAPE,
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
  timeLockStrategy: timeLockStrategySAPE,
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
  timeLockStrategy: timeLockStrategyCAPE,
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

export const strategyYAPE: IReserveParams = {
  strategy: rateStrategyAPE,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyYAPE,
  baseLTVAsCollateral: "2000",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "7000",
  liquidationBonus: "10500",
  borrowingEnabled: false,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PYieldTokenImpl,
  reserveFactor: "1000",
  borrowCap: "0",
  supplyCap: "18062500",
};

export const strategyXCDOT: IReserveParams = {
  strategy: rateStrategyXCDOT,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyXCDOT,
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
  timeLockStrategy: timeLockStrategyWGLMR,
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
  timeLockStrategy: timeLockStrategyBAYC,
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
  timeLockStrategy: timeLockStrategyMAYC,
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
  timeLockStrategy: timeLockStrategyBAKC,
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
  timeLockStrategy: timeLockStrategyDoodles,
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
  timeLockStrategy: timeLockStrategyOTHR,
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
  timeLockStrategy: timeLockStrategyCloneX,
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
  timeLockStrategy: timeLockStrategyMoonbird,
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
  timeLockStrategy: timeLockStrategyMeebits,
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
  timeLockStrategy: timeLockStrategyAzuki,
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
  timeLockStrategy: timeLockStrategyWPunks,
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
  timeLockStrategy: timeLockStrategyUniswapV3,
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

export const strategySEWER: IReserveParams = {
  strategy: rateStrategyNFT,
  auctionStrategy: auctionStrategySEWER, // same as BAKC, it won't be used as collateral so it's ok
  timeLockStrategy: timeLockStrategySEWER,
  baseLTVAsCollateral: "0",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "0000",
  liquidationBonus: "00000",
  borrowingEnabled: false,
  reserveDecimals: "0",
  xTokenImpl: eContractid.NTokenImpl,
  reserveFactor: "0",
  borrowCap: "0",
  supplyCap: "1000",
};

export const strategyPudgyPenguins: IReserveParams = {
  strategy: rateStrategyNFT,
  auctionStrategy: auctionStrategyPudgyPenguins,
  timeLockStrategy: timeLockStrategyPenguins,
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

export const strategyStakefishValidator: IReserveParams = {
  strategy: rateStrategyNFT,
  auctionStrategy: auctionStrategyStakefishValidator,
  timeLockStrategy: timeLockStrategyStakefishValidator,
  baseLTVAsCollateral: "7425",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "7740",
  liquidationBonus: "10450",
  borrowingEnabled: false,
  reserveDecimals: "0",
  xTokenImpl: eContractid.NTokenStakefishImpl,
  reserveFactor: "0",
  borrowCap: "0",
  supplyCap: "20",
};

////////////////////////////////////////////////////////////
// V2
////////////////////////////////////////////////////////////
export const strategyCBETH: IReserveParams = {
  strategy: rateStrategyXETH,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyWETH,
  baseLTVAsCollateral: "7200",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "8300",
  liquidationBonus: "10700",
  borrowingEnabled: true,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PTokenImpl,
  reserveFactor: "1000",
  borrowCap: "110000",
  supplyCap: "110000",
};

export const strategySTETH: IReserveParams = {
  strategy: rateStrategyXETH,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyWETH,
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

export const strategyASTETH: IReserveParams = {
  strategy: rateStrategyXETH,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyASTETH,
  baseLTVAsCollateral: "6900",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "8100",
  liquidationBonus: "10750",
  borrowingEnabled: true,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PTokenAStETHImpl,
  reserveFactor: "1000",
  borrowCap: "0",
  supplyCap: "0",
};

export const strategyWSTETH: IReserveParams = {
  strategy: rateStrategyXETH,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyWSTETH,
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

export const strategyAWSTETH: IReserveParams = {
  strategy: rateStrategyXETH,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyAWSTETH,
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

export const strategyBENDETH: IReserveParams = {
  strategy: rateStrategyXETH,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyBENDETH,
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

export const strategyAWETH: IReserveParams = {
  strategy: rateStrategyXETH,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyAWETH,
  baseLTVAsCollateral: "8250",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "8600",
  liquidationBonus: "10450",
  borrowingEnabled: true,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PTokenATokenImpl,
  reserveFactor: "1000",
  borrowCap: "80000",
  supplyCap: "80000",
};

export const strategyCETH: IReserveParams = {
  strategy: rateStrategyXETH,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyCETH,
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

export const strategyRETH: IReserveParams = {
  strategy: rateStrategyXETH,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyRETH,
  baseLTVAsCollateral: "7200",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "8300",
  liquidationBonus: "10700",
  borrowingEnabled: true,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PTokenImpl,
  reserveFactor: "1000",
  borrowCap: "20000",
  supplyCap: "20000",
};

export const strategyPUNK: IReserveParams = {
  // address: "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB",
  strategy: rateStrategyXETH,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyPUNK,
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

export const strategyBLUR: IReserveParams = {
  strategy: rateStrategyBLUR,
  auctionStrategy: auctionStrategyZero,
  timeLockStrategy: timeLockStrategyBLUR,
  baseLTVAsCollateral: "2500",
  liquidationProtocolFeePercentage: "0",
  liquidationThreshold: "3500",
  liquidationBonus: "11000",
  borrowingEnabled: true,
  reserveDecimals: "18",
  xTokenImpl: eContractid.PTokenImpl,
  reserveFactor: "1000",
  borrowCap: "5000000",
  supplyCap: "5000000",
};
