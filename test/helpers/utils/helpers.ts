import {IPool} from "../../../types";
import {ReserveData, UserReserveData} from "./interfaces";
import {
  getIErc20Detailed,
  getIRStrategy,
  getMintableERC20,
  getPToken,
  getVariableDebtToken,
} from "../../../helpers/contracts-getters";
import {tEthereumAddress} from "../../../helpers/types";
import {getDb, DRE} from "../../../helpers/misc-utils";
import {ProtocolDataProvider} from "../../../types";
import {BigNumber, ethers} from "ethers";
import {PToken} from "../../../types";
import {ONE_ADDRESS} from "../../../helpers/constants";

export const getReserveData = async (
  helper: ProtocolDataProvider,
  reserve: tEthereumAddress
): Promise<ReserveData> => {
  const [
    reserveData,
    tokenAddresses,
    irStrategyAddress,
    reserveConfiguration,
    token,
  ] = await Promise.all([
    helper.getReserveData(reserve),
    helper.getReserveTokensAddresses(reserve),
    helper
      .getStrategyAddresses(reserve)
      .then(({interestRateStrategyAddress}) => interestRateStrategyAddress),
    helper.getReserveConfigurationData(reserve),
    getIErc20Detailed(reserve),
  ]);

  const variableDebtToken = await getVariableDebtToken(
    tokenAddresses.variableDebtTokenAddress
  );

  await getIRStrategy(irStrategyAddress);

  const scaledVariableDebt = await variableDebtToken.scaledTotalSupply();

  const symbol = await token.symbol();
  const decimals = BigNumber.from(await token.decimals());

  const accruedToTreasuryScaled = reserveData.accruedToTreasuryScaled;
  const xToken = (await getPToken(tokenAddresses.xTokenAddress)) as PToken;

  // Need the reserve factor
  const reserveFactor = reserveConfiguration.reserveFactor;

  const availableLiquidity = await token.balanceOf(xToken.address);

  const totalDebt = reserveData.totalVariableDebt;

  const borrowUtilizationRate = totalDebt.eq(0)
    ? BigNumber.from(0)
    : totalDebt.rayDiv(availableLiquidity.add(totalDebt));

  let supplyUtilizationRate = totalDebt.eq(0)
    ? BigNumber.from(0)
    : totalDebt.rayDiv(availableLiquidity.add(totalDebt));

  supplyUtilizationRate =
    supplyUtilizationRate > borrowUtilizationRate
      ? borrowUtilizationRate
      : supplyUtilizationRate;

  return {
    reserveFactor,
    accruedToTreasuryScaled,
    availableLiquidity,
    borrowUtilizationRate,
    supplyUtilizationRate,
    totalVariableDebt: reserveData.totalVariableDebt,
    liquidityRate: reserveData.liquidityRate,
    variableBorrowRate: reserveData.variableBorrowRate,
    liquidityIndex: reserveData.liquidityIndex,
    variableBorrowIndex: reserveData.variableBorrowIndex,
    lastUpdateTimestamp: BigNumber.from(reserveData.lastUpdateTimestamp),
    scaledVariableDebt: scaledVariableDebt,
    address: reserve,
    xTokenAddress: tokenAddresses.xTokenAddress,
    symbol,
    decimals,
  };
};

export const getUserData = async (
  pool: IPool,
  helper: ProtocolDataProvider,
  reserve: string,
  user: tEthereumAddress,
  sender?: tEthereumAddress
): Promise<UserReserveData> => {
  const [userData, scaledPTokenBalance] = await Promise.all([
    helper.getUserReserveData(reserve, user),
    getPTokenUserData(reserve, user, helper),
  ]);

  const token = await getMintableERC20(reserve);
  const walletBalance = await token.balanceOf(sender || user);

  return {
    scaledPTokenBalance: BigNumber.from(scaledPTokenBalance),
    currentPTokenBalance: userData.currentXTokenBalance,
    currentVariableDebt: userData.currentVariableDebt,
    scaledVariableDebt: userData.scaledVariableDebt,
    liquidityRate: userData.liquidityRate,
    usageAsCollateralEnabled: userData.usageAsCollateralEnabled,
    walletBalance,
  };
};

export const getTokenAddressFromSymbol = async (symbol: string) => {
  const token = await getMintableERC20(
    (
      await getDb().get(`${symbol}.${DRE.network.name}`).value()
    ).address
  );

  if (!token) {
    throw `Could not find instance for contract ${symbol}`;
  }
  return token.address;
};

const getPTokenUserData = async (
  reserve: string,
  user: string,
  protocolDataProvider: ProtocolDataProvider
) => {
  const xTokenAddress: string = (
    await protocolDataProvider.getReserveTokensAddresses(reserve)
  ).xTokenAddress;

  const xToken = await getPToken(xTokenAddress);

  const scaledBalance = await xToken.scaledBalanceOf(user);
  return scaledBalance.toString();
};

export const convertFromCurrencyDecimals = async (
  tokenAddress: tEthereumAddress,
  amount: string
) => {
  let decimals = "18";
  if (tokenAddress !== ONE_ADDRESS) {
    const token = await getIErc20Detailed(tokenAddress);
    decimals = (await token.decimals()).toString();
  }

  return ethers.utils.formatUnits(amount, decimals);
};
