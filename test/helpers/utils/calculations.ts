import {
  ONE_YEAR,
  RAY,
  MAX_UINT_AMOUNT,
  PERCENTAGE_FACTOR,
} from "../../../helpers/constants";
import {IReserveParams, iMultiPoolsAssets} from "../../../helpers/types";
import "./wadraymath";
import {ReserveData, UserReserveData} from "./interfaces";
import {BigNumber} from "ethers";

interface Configuration {
  reservesParams: iMultiPoolsAssets<IReserveParams>;
}

export const configuration: Configuration = <Configuration>{};

export const calcExpectedUserDataAfterDeposit = (
  amountDeposited: string,
  reserveDataBeforeAction: ReserveData,
  reserveDataAfterAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  txTimestamp: BigNumber,
  // eslint-disable-next-line
  currentTimestamp: BigNumber,
  // eslint-disable-next-line
  txCost: BigNumber
): UserReserveData => {
  const expectedUserData = <UserReserveData>{};

  expectedUserData.currentVariableDebt = calcExpectedVariableDebtTokenBalance(
    reserveDataBeforeAction,
    userDataBeforeAction,
    txTimestamp
  );

  expectedUserData.scaledVariableDebt = userDataBeforeAction.scaledVariableDebt;
  expectedUserData.variableBorrowIndex =
    userDataBeforeAction.variableBorrowIndex;
  expectedUserData.liquidityRate = reserveDataAfterAction.liquidityRate;

  expectedUserData.scaledPTokenBalance = calcExpectedScaledPTokenBalance(
    userDataBeforeAction,
    reserveDataAfterAction.liquidityIndex,
    BigNumber.from(amountDeposited),
    BigNumber.from(0)
  );
  expectedUserData.currentPTokenBalance = calcExpectedPTokenBalance(
    reserveDataBeforeAction,
    userDataBeforeAction,
    txTimestamp
  ).add(amountDeposited);

  if (userDataBeforeAction.currentPTokenBalance.eq(0)) {
    expectedUserData.usageAsCollateralEnabled = true;
  } else {
    expectedUserData.usageAsCollateralEnabled =
      userDataBeforeAction.usageAsCollateralEnabled;
  }

  expectedUserData.variableBorrowIndex =
    userDataBeforeAction.variableBorrowIndex;
  expectedUserData.walletBalance =
    userDataBeforeAction.walletBalance.sub(amountDeposited);

  expectedUserData.currentVariableDebt = calcExpectedVariableDebtTokenBalance(
    reserveDataBeforeAction,
    userDataBeforeAction,
    txTimestamp
  );

  return expectedUserData;
};

export const calcExpectedUserDataAfterWithdraw = (
  amountWithdrawn: string,
  reserveDataBeforeAction: ReserveData,
  reserveDataAfterAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  txTimestamp: BigNumber,
  // eslint-disable-next-line
  currentTimestamp: BigNumber,
  // eslint-disable-next-line
  txCost: BigNumber
): UserReserveData => {
  const expectedUserData = <UserReserveData>{};

  const xTokenBalance = calcExpectedPTokenBalance(
    reserveDataBeforeAction,
    userDataBeforeAction,
    txTimestamp
  );

  if (amountWithdrawn == MAX_UINT_AMOUNT) {
    amountWithdrawn = xTokenBalance.toString();
  }

  expectedUserData.scaledPTokenBalance = calcExpectedScaledPTokenBalance(
    userDataBeforeAction,
    reserveDataAfterAction.liquidityIndex,
    BigNumber.from(0),
    BigNumber.from(amountWithdrawn)
  );

  expectedUserData.currentPTokenBalance = xTokenBalance.sub(amountWithdrawn);
  expectedUserData.scaledVariableDebt = userDataBeforeAction.scaledVariableDebt;

  expectedUserData.currentVariableDebt = calcExpectedVariableDebtTokenBalance(
    reserveDataBeforeAction,
    userDataBeforeAction,
    txTimestamp
  );

  expectedUserData.variableBorrowIndex =
    userDataBeforeAction.variableBorrowIndex;

  expectedUserData.liquidityRate = reserveDataAfterAction.liquidityRate;

  if (userDataBeforeAction.currentPTokenBalance.eq(0)) {
    expectedUserData.usageAsCollateralEnabled = true;
  } else {
    //if the user is withdrawing everything, usageAsCollateralEnabled must be false
    if (expectedUserData.currentPTokenBalance.eq(0)) {
      expectedUserData.usageAsCollateralEnabled = false;
    } else {
      expectedUserData.usageAsCollateralEnabled =
        userDataBeforeAction.usageAsCollateralEnabled;
    }
  }

  expectedUserData.walletBalance =
    userDataBeforeAction.walletBalance.add(amountWithdrawn);

  return expectedUserData;
};

export const calcExpectedReserveDataAfterDeposit = (
  amountDeposited: string,
  reserveDataBeforeAction: ReserveData,
  txTimestamp: BigNumber
): ReserveData => {
  const expectedReserveData: ReserveData = <ReserveData>{};
  expectedReserveData.address = reserveDataBeforeAction.address;
  expectedReserveData.reserveFactor = reserveDataBeforeAction.reserveFactor;

  updateState(reserveDataBeforeAction, expectedReserveData, txTimestamp);
  updateLiquidityAndUtils(
    reserveDataBeforeAction,
    expectedReserveData,
    BigNumber.from(amountDeposited),
    BigNumber.from(0)
  );

  const rates = calcExpectedInterestRates(
    reserveDataBeforeAction.symbol,
    expectedReserveData.totalVariableDebt,
    expectedReserveData.availableLiquidity
  );
  expectedReserveData.liquidityRate = rates[0];
  expectedReserveData.variableBorrowRate = rates[1];

  updateTotalLiquidityAndUtil(expectedReserveData);

  return expectedReserveData;
};

export const calcExpectedReserveDataAfterWithdraw = (
  amountWithdrawn: string,
  reserveDataBeforeAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  txTimestamp: BigNumber
): ReserveData => {
  const expectedReserveData: ReserveData = <ReserveData>{};
  expectedReserveData.address = reserveDataBeforeAction.address;
  expectedReserveData.reserveFactor = reserveDataBeforeAction.reserveFactor;

  if (amountWithdrawn == MAX_UINT_AMOUNT) {
    amountWithdrawn = calcExpectedPTokenBalance(
      reserveDataBeforeAction,
      userDataBeforeAction,
      txTimestamp
    ).toString();
  }

  updateState(reserveDataBeforeAction, expectedReserveData, txTimestamp);
  updateLiquidityAndUtils(
    reserveDataBeforeAction,
    expectedReserveData,
    BigNumber.from(0),
    BigNumber.from(amountWithdrawn)
  );

  const rates = calcExpectedInterestRates(
    reserveDataBeforeAction.symbol,
    expectedReserveData.totalVariableDebt,
    expectedReserveData.availableLiquidity
  );
  expectedReserveData.liquidityRate = rates[0];
  expectedReserveData.variableBorrowRate = rates[1];

  updateTotalLiquidityAndUtil(expectedReserveData);

  return expectedReserveData;
};

export const calcExpectedReserveDataAfterBorrow = (
  amountBorrowed: string,
  reserveDataBeforeAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  txTimestamp: BigNumber,
  currentTimestamp: BigNumber
): ReserveData => {
  const expectedReserveData: ReserveData = <ReserveData>{};
  expectedReserveData.address = reserveDataBeforeAction.address;
  expectedReserveData.reserveFactor = reserveDataBeforeAction.reserveFactor;
  expectedReserveData.lastUpdateTimestamp = txTimestamp;

  const amountBorrowedBN = BigNumber.from(amountBorrowed);

  // Update indexes
  updateState(reserveDataBeforeAction, expectedReserveData, txTimestamp);
  updateLiquidityAndUtils(
    reserveDataBeforeAction,
    expectedReserveData,
    BigNumber.from(0),
    BigNumber.from(amountBorrowed)
  );

  // Now we can perform the borrow THERE MUST BE SOMETHING IN HERE THAN CAN BE SIMPLIFIED
  {
    expectedReserveData.scaledVariableDebt =
      reserveDataBeforeAction.scaledVariableDebt.add(
        amountBorrowedBN.rayDiv(expectedReserveData.variableBorrowIndex)
      );

    const totalVariableDebtAfterTx =
      expectedReserveData.scaledVariableDebt.rayMul(
        expectedReserveData.variableBorrowIndex
      );

    [
      expectedReserveData.borrowUtilizationRate,
      expectedReserveData.supplyUtilizationRate,
    ] = calcExpectedUtilizationRates(
      expectedReserveData.totalVariableDebt,
      expectedReserveData.availableLiquidity
    );

    const rates = calcExpectedInterestRates(
      reserveDataBeforeAction.symbol,
      totalVariableDebtAfterTx,
      expectedReserveData.availableLiquidity
    );

    expectedReserveData.liquidityRate = rates[0];
    expectedReserveData.variableBorrowRate = rates[1];

    expectedReserveData.totalVariableDebt =
      expectedReserveData.scaledVariableDebt.rayMul(
        calcExpectedReserveNormalizedDebt(
          expectedReserveData.variableBorrowRate,
          expectedReserveData.variableBorrowIndex,
          txTimestamp,
          currentTimestamp
        )
      );

    [
      expectedReserveData.borrowUtilizationRate,
      expectedReserveData.supplyUtilizationRate,
    ] = calcExpectedUtilizationRates(
      expectedReserveData.totalVariableDebt,
      expectedReserveData.availableLiquidity
    );
  }

  return expectedReserveData;
};

export const calcExpectedReserveDataAfterRepay = (
  amountRepaid: string,
  reserveDataBeforeAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  txTimestamp: BigNumber,
  // eslint-disable-next-line
  currentTimestamp: BigNumber
): ReserveData => {
  const expectedReserveData: ReserveData = <ReserveData>{};
  expectedReserveData.address = reserveDataBeforeAction.address;
  expectedReserveData.reserveFactor = reserveDataBeforeAction.reserveFactor;

  // TODO: The repay amount here need to be capped to the balance.

  let amountRepaidBN = BigNumber.from(amountRepaid);

  const userVariableDebt = calcExpectedVariableDebtTokenBalance(
    reserveDataBeforeAction,
    userDataBeforeAction,
    txTimestamp
  );

  //if amount repaid == MAX_UINT_AMOUNT, user is repaying everything
  if (amountRepaidBN.abs().eq(MAX_UINT_AMOUNT)) {
    {
      amountRepaidBN = userVariableDebt;
    }
  }

  updateState(reserveDataBeforeAction, expectedReserveData, txTimestamp);
  updateLiquidityAndUtils(
    reserveDataBeforeAction,
    expectedReserveData,
    amountRepaidBN,
    BigNumber.from(0)
  );

  {
    expectedReserveData.scaledVariableDebt =
      reserveDataBeforeAction.scaledVariableDebt.sub(
        amountRepaidBN.rayDiv(expectedReserveData.variableBorrowIndex)
      );
    expectedReserveData.totalVariableDebt =
      expectedReserveData.scaledVariableDebt.rayMul(
        expectedReserveData.variableBorrowIndex
      );
  }

  // Update utilization rate because of debt change
  [
    expectedReserveData.borrowUtilizationRate,
    expectedReserveData.supplyUtilizationRate,
  ] = calcExpectedUtilizationRates(
    expectedReserveData.totalVariableDebt,
    expectedReserveData.availableLiquidity
  );

  const rates = calcExpectedInterestRates(
    reserveDataBeforeAction.symbol,
    expectedReserveData.totalVariableDebt,
    expectedReserveData.availableLiquidity
  );
  expectedReserveData.liquidityRate = rates[0];
  expectedReserveData.variableBorrowRate = rates[1];

  expectedReserveData.lastUpdateTimestamp = txTimestamp;

  updateTotalLiquidityAndUtil(expectedReserveData);

  return expectedReserveData;
};

export const calcExpectedUserDataAfterBorrow = (
  amountBorrowed: string,
  reserveDataBeforeAction: ReserveData,
  expectedDataAfterAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  txTimestamp: BigNumber,
  currentTimestamp: BigNumber
): UserReserveData => {
  const expectedUserData = <UserReserveData>{};

  const amountBorrowedBN = BigNumber.from(amountBorrowed);

  {
    expectedUserData.scaledVariableDebt =
      reserveDataBeforeAction.scaledVariableDebt.add(
        amountBorrowedBN.rayDiv(expectedDataAfterAction.variableBorrowIndex)
      );
  }

  expectedUserData.currentVariableDebt = calcExpectedVariableDebtTokenBalance(
    expectedDataAfterAction,
    expectedUserData,
    currentTimestamp
  );

  expectedUserData.liquidityRate = expectedDataAfterAction.liquidityRate;

  expectedUserData.usageAsCollateralEnabled =
    userDataBeforeAction.usageAsCollateralEnabled;

  expectedUserData.currentPTokenBalance = calcExpectedPTokenBalance(
    expectedDataAfterAction,
    userDataBeforeAction,
    currentTimestamp
  );

  expectedUserData.scaledPTokenBalance =
    userDataBeforeAction.scaledPTokenBalance;

  expectedUserData.walletBalance =
    userDataBeforeAction.walletBalance.add(amountBorrowed);

  return expectedUserData;
};

export const calcExpectedUserDataAfterRepay = (
  totalRepaid: string,
  reserveDataBeforeAction: ReserveData,
  expectedDataAfterAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  user: string,
  onBehalfOf: string,
  txTimestamp: BigNumber,
  currentTimestamp: BigNumber
): UserReserveData => {
  const expectedUserData = <UserReserveData>{};

  const variableDebt = calcExpectedVariableDebtTokenBalance(
    reserveDataBeforeAction,
    userDataBeforeAction,
    currentTimestamp
  );

  let totalRepaidBN = BigNumber.from(totalRepaid);
  if (totalRepaidBN.abs().eq(MAX_UINT_AMOUNT)) {
    totalRepaidBN = variableDebt;
  }

  {
    expectedUserData.scaledVariableDebt =
      userDataBeforeAction.scaledVariableDebt.sub(
        totalRepaidBN.rayDiv(expectedDataAfterAction.variableBorrowIndex)
      );
    expectedUserData.currentVariableDebt =
      expectedUserData.scaledVariableDebt.rayMul(
        expectedDataAfterAction.variableBorrowIndex
      );
  }

  expectedUserData.liquidityRate = expectedDataAfterAction.liquidityRate;

  expectedUserData.usageAsCollateralEnabled =
    userDataBeforeAction.usageAsCollateralEnabled;

  expectedUserData.currentPTokenBalance = calcExpectedPTokenBalance(
    reserveDataBeforeAction,
    userDataBeforeAction,
    txTimestamp
  );
  expectedUserData.scaledPTokenBalance =
    userDataBeforeAction.scaledPTokenBalance;

  if (user === onBehalfOf) {
    expectedUserData.walletBalance =
      userDataBeforeAction.walletBalance.sub(totalRepaidBN);
  } else {
    //wallet balance didn't change
    expectedUserData.walletBalance = userDataBeforeAction.walletBalance;
  }

  return expectedUserData;
};

export const calcExpectedUserDataAfterSetUseAsCollateral = (
  useAsCollateral: boolean,
  reserveDataBeforeAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  // eslint-disable-next-line
  txCost: BigNumber
): UserReserveData => {
  const expectedUserData = {...userDataBeforeAction};

  expectedUserData.usageAsCollateralEnabled = useAsCollateral;

  return expectedUserData;
};

const calcExpectedScaledPTokenBalance = (
  userDataBeforeAction: UserReserveData,
  index: BigNumber,
  amountAdded: BigNumber,
  amountTaken: BigNumber
) => {
  return userDataBeforeAction.scaledPTokenBalance
    .add(amountAdded.rayDiv(index))
    .sub(amountTaken.rayDiv(index));
};

export const calcExpectedPTokenBalance = (
  reserveData: ReserveData,
  userData: UserReserveData,
  currentTimestamp: BigNumber
) => {
  const index = calcExpectedReserveNormalizedIncome(
    reserveData,
    currentTimestamp
  );

  const {scaledPTokenBalance: scaledBalanceBeforeAction} = userData;

  return scaledBalanceBeforeAction.rayMul(index);
};

export const calcExpectedVariableDebtTokenBalance = (
  reserveData: ReserveData,
  userData: UserReserveData,
  currentTimestamp: BigNumber
) => {
  const normalizedDebt = calcExpectedReserveNormalizedDebt(
    reserveData.variableBorrowRate,
    reserveData.variableBorrowIndex,
    reserveData.lastUpdateTimestamp,
    currentTimestamp
  );

  const {scaledVariableDebt} = userData;

  return scaledVariableDebt.rayMul(normalizedDebt);
};

const calcLinearInterest = (
  rate: BigNumber,
  currentTimestamp: BigNumber,
  lastUpdateTimestamp: BigNumber
) => {
  const timeDifference = currentTimestamp.sub(lastUpdateTimestamp);

  const cumulatedInterest = rate
    .mul(timeDifference)
    .div(BigNumber.from(ONE_YEAR))
    .add(RAY);

  return cumulatedInterest;
};

export const calcCompoundedInterest = (
  rate: BigNumber,
  currentTimestamp: BigNumber,
  lastUpdateTimestamp: BigNumber
) => {
  const timeDifference = currentTimestamp.sub(lastUpdateTimestamp);
  const SECONDS_PER_YEAR = BigNumber.from(ONE_YEAR);

  if (timeDifference.eq(0)) {
    return BigNumber.from(RAY);
  }

  const expMinusOne = timeDifference.sub(1);
  const expMinusTwo = timeDifference.gt(2) ? timeDifference.sub(2) : 0;

  const basePowerTwo = rate
    .rayMul(rate)
    .div(SECONDS_PER_YEAR.mul(SECONDS_PER_YEAR));
  const basePowerThree = basePowerTwo.rayMul(rate).div(SECONDS_PER_YEAR);

  const secondTerm = timeDifference.mul(expMinusOne).mul(basePowerTwo).div(2);
  const thirdTerm = timeDifference
    .mul(expMinusOne)
    .mul(expMinusTwo)
    .mul(basePowerThree)
    .div(6);

  return BigNumber.from(RAY)
    .add(rate.mul(timeDifference).div(SECONDS_PER_YEAR))
    .add(secondTerm)
    .add(thirdTerm);
};

export const calcExpectedInterestRates = (
  reserveSymbol: string,
  totalVariableDebt: BigNumber,
  availableLiquidity: BigNumber
): BigNumber[] => {
  const {reservesParams} = configuration;

  const reserveIndex = Object.keys(reservesParams).findIndex(
    (value) => value === reserveSymbol
  );
  const [, reserveConfiguration] = (
    Object.entries(reservesParams) as [string, IReserveParams][]
  )[reserveIndex];

  const [borrowUtilizationRate, supplyUtilizationRate] =
    calcExpectedUtilizationRates(totalVariableDebt, availableLiquidity);

  let variableBorrowRate: BigNumber = BigNumber.from(
    reserveConfiguration.strategy.baseVariableBorrowRate
  );

  const optimalRate = BigNumber.from(
    reserveConfiguration.strategy.optimalUsageRatio
  );
  const excessRate = BigNumber.from(RAY).sub(optimalRate);

  if (borrowUtilizationRate.gt(optimalRate)) {
    const excessUtilizationRateRatio = borrowUtilizationRate
      .sub(reserveConfiguration.strategy.optimalUsageRatio)
      .rayDiv(excessRate);

    variableBorrowRate = variableBorrowRate
      .add(reserveConfiguration.strategy.variableRateSlope1)
      .add(
        BigNumber.from(reserveConfiguration.strategy.variableRateSlope2).rayMul(
          excessUtilizationRateRatio
        )
      );
  } else {
    variableBorrowRate = variableBorrowRate.add(
      BigNumber.from(reserveConfiguration.strategy.variableRateSlope1)
        .rayMul(borrowUtilizationRate)
        .rayDiv(optimalRate)
    );
  }

  const liquidityRate = variableBorrowRate
    .rayMul(supplyUtilizationRate)
    .percentMul(
      BigNumber.from(PERCENTAGE_FACTOR).sub(reserveConfiguration.reserveFactor)
    );

  return [liquidityRate, variableBorrowRate];
};

export const calcExpectedOverallBorrowRate = (
  totalVariableDebt: BigNumber,
  currentVariableBorrowRate: BigNumber
): BigNumber => {
  const totalBorrows = totalVariableDebt;

  if (totalBorrows.eq(0)) return BigNumber.from(0);

  const weightedVariableRate = totalVariableDebt
    .wadToRay()
    .rayMul(currentVariableBorrowRate);

  const overallBorrowRate = weightedVariableRate.rayDiv(
    totalBorrows.wadToRay()
  );

  return overallBorrowRate;
};

export const calcExpectedUtilizationRates = (
  totalVariableDebt: BigNumber,
  availableLiquidity: BigNumber
): BigNumber[] => {
  const totalDebt = totalVariableDebt;
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

  return [borrowUtilizationRate, supplyUtilizationRate];
};

export const calcExpectedReserveNormalizedIncome = (
  reserveData: ReserveData,
  currentTimestamp: BigNumber
) => {
  const {liquidityRate, liquidityIndex, lastUpdateTimestamp} = reserveData;

  //if utilization rate is 0, nothing to compound
  if (liquidityRate.eq("0")) {
    return liquidityIndex;
  }

  const cumulatedInterest = calcLinearInterest(
    liquidityRate,
    currentTimestamp,
    lastUpdateTimestamp
  );

  const income = cumulatedInterest.rayMul(liquidityIndex);

  return income;
};

export const calcExpectedReserveNormalizedDebt = (
  variableBorrowRate: BigNumber,
  variableBorrowIndex: BigNumber,
  lastUpdateTimestamp: BigNumber,
  currentTimestamp: BigNumber
) => {
  //if utilization rate is 0, nothing to compound
  if (variableBorrowRate.eq("0")) {
    return variableBorrowIndex;
  }

  const cumulatedInterest = calcCompoundedInterest(
    variableBorrowRate,
    currentTimestamp,
    lastUpdateTimestamp
  );

  const debt = cumulatedInterest.rayMul(variableBorrowIndex);

  return debt;
};

const calcExpectedLiquidityIndex = (
  reserveData: ReserveData,
  timestamp: BigNumber
) => {
  //if utilization rate is 0, nothing to compound
  if (reserveData.supplyUtilizationRate.eq(0)) {
    return reserveData.liquidityIndex;
  }

  const cumulatedInterest = calcLinearInterest(
    reserveData.liquidityRate,
    timestamp,
    reserveData.lastUpdateTimestamp
  );

  return cumulatedInterest.rayMul(reserveData.liquidityIndex);
};

const calcExpectedVariableBorrowIndex = (
  reserveData: ReserveData,
  timestamp: BigNumber
) => {
  //if totalVariableDebt is 0, nothing to compound
  if (reserveData.totalVariableDebt.eq("0")) {
    return reserveData.variableBorrowIndex;
  }

  const cumulatedInterest = calcCompoundedInterest(
    reserveData.variableBorrowRate,
    timestamp,
    reserveData.lastUpdateTimestamp
  );

  return cumulatedInterest.rayMul(reserveData.variableBorrowIndex);
};

const calcExpectedTotalVariableDebt = (
  reserveData: ReserveData,
  expectedVariableDebtIndex: BigNumber
) => {
  return reserveData.scaledVariableDebt.rayMul(expectedVariableDebtIndex);
};

const calcExpectedAccrueToTreasury = (
  reserveData: ReserveData,
  nextReserveData: ReserveData
) => {
  const reserveFactor = reserveData.reserveFactor;
  if (reserveFactor.eq(0)) {
    return reserveData.accruedToTreasuryScaled;
  }

  const prevTotalVariableDebt = reserveData.scaledVariableDebt.rayMul(
    reserveData.variableBorrowIndex
  );

  const currTotalVariableDebt = nextReserveData.scaledVariableDebt.rayMul(
    nextReserveData.variableBorrowIndex
  );

  const totalDebtAccrued = currTotalVariableDebt.sub(prevTotalVariableDebt);

  const amountToMint = totalDebtAccrued.percentMul(reserveFactor);

  if (amountToMint.gt(0)) {
    return reserveData.accruedToTreasuryScaled.add(
      amountToMint.rayDiv(nextReserveData.liquidityIndex)
    );
  } else {
    return reserveData.accruedToTreasuryScaled;
  }
};

const updateState = (
  reserveDataBeforeAction: ReserveData,
  expectedReserveData: ReserveData,
  txTimestamp: BigNumber
) => {
  // Update indexes
  expectedReserveData.liquidityIndex = calcExpectedLiquidityIndex(
    reserveDataBeforeAction,
    txTimestamp
  );
  expectedReserveData.variableBorrowIndex = calcExpectedVariableBorrowIndex(
    reserveDataBeforeAction,
    txTimestamp
  );

  expectedReserveData.totalVariableDebt = calcExpectedTotalVariableDebt(
    reserveDataBeforeAction,
    expectedReserveData.variableBorrowIndex
  );

  expectedReserveData.scaledVariableDebt =
    reserveDataBeforeAction.scaledVariableDebt;

  // Accrue to treasury
  expectedReserveData.accruedToTreasuryScaled = calcExpectedAccrueToTreasury(
    reserveDataBeforeAction,
    expectedReserveData
  );
};

const updateLiquidityAndUtils = (
  reserveDataBeforeAction: ReserveData,
  expectedReserveData: ReserveData,
  liquidityAdded: BigNumber,
  liquidityTaken: BigNumber
) => {
  expectedReserveData.availableLiquidity =
    reserveDataBeforeAction.availableLiquidity
      .add(liquidityAdded)
      .sub(liquidityTaken);
  [
    expectedReserveData.borrowUtilizationRate,
    expectedReserveData.supplyUtilizationRate,
  ] = calcExpectedUtilizationRates(
    expectedReserveData.totalVariableDebt,
    expectedReserveData.availableLiquidity
  );
};

const updateTotalLiquidityAndUtil = (expectedReserveData: ReserveData) => {
  [
    expectedReserveData.borrowUtilizationRate,
    expectedReserveData.supplyUtilizationRate,
  ] = calcExpectedUtilizationRates(
    expectedReserveData.totalVariableDebt,
    expectedReserveData.availableLiquidity
  );
};
