import {expect} from "chai";
import {BigNumber, BigNumberish, utils} from "ethers";
import {deployReserveInterestRateStrategy} from "../deploy/helpers/contracts-deployments";
import {PERCENTAGE_FACTOR} from "../deploy/helpers/constants";
import {
  PToken,
  DefaultReserveInterestRateStrategy,
  MintableERC20,
} from "../types";
import {strategyDAI} from "../deploy/market-config/reservesConfigs";
import {rateStrategyStableTwo} from "../deploy/market-config/rateStrategies";
import {TestEnv} from "./helpers/make-suite";
import "./helpers/utils/wadraymath";
import {formatUnits} from "@ethersproject/units";
import {eContractid, ProtocolErrors} from "../deploy/helpers/types";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";

const DEBUG = false;

type CalculateInterestRatesParams = {
  liquidityAdded: BigNumberish;
  liquidityTaken: BigNumberish;
  totalVariableDebt: BigNumberish;
  reserveFactor: BigNumberish;
  reserve: string;
  xToken: string;
};

describe("InterestRateStrategy", () => {
  let testEnv: TestEnv;
  let strategyInstance: DefaultReserveInterestRateStrategy;
  let dai: MintableERC20;
  let pDai: PToken;

  const {INVALID_OPTIMAL_USAGE_RATIO} = ProtocolErrors;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {addressesProvider} = testEnv;
    dai = testEnv.dai;
    pDai = testEnv.pDai;

    strategyInstance = await deployReserveInterestRateStrategy(
      eContractid.DefaultReserveInterestRateStrategy,
      [
        addressesProvider.address,
        rateStrategyStableTwo.optimalUsageRatio,
        rateStrategyStableTwo.baseVariableBorrowRate,
        rateStrategyStableTwo.variableRateSlope1,
        rateStrategyStableTwo.variableRateSlope2,
      ]
    );
  });

  it("Checks rates at 0% usage ratio, empty reserve", async () => {
    const params: CalculateInterestRatesParams = {
      liquidityAdded: 0,
      liquidityTaken: 0,
      totalVariableDebt: 0,
      reserveFactor: strategyDAI.reserveFactor,
      reserve: dai.address,
      xToken: pDai.address,
    };

    const {0: currentLiquidityRate, 1: currentVariableBorrowRate} =
      await strategyInstance.calculateInterestRates(params);

    expect(currentLiquidityRate).to.be.equal(0, "Invalid liquidity rate");
    expect(currentVariableBorrowRate).to.be.equal(
      rateStrategyStableTwo.baseVariableBorrowRate,
      "Invalid variable rate"
    );
  });

  it("Checks rates at 80% usage ratio", async () => {
    const params: CalculateInterestRatesParams = {
      liquidityAdded: "200000000000000000",
      liquidityTaken: 0,
      totalVariableDebt: "800000000000000000",
      reserveFactor: strategyDAI.reserveFactor,
      reserve: dai.address,
      xToken: pDai.address,
    };

    const {0: currentLiquidityRate, 1: currentVariableBorrowRate} =
      await strategyInstance.calculateInterestRates(params);

    const expectedVariableRate = BigNumber.from(
      rateStrategyStableTwo.baseVariableBorrowRate
    ).add(rateStrategyStableTwo.variableRateSlope1);

    expect(currentLiquidityRate).to.be.equal(
      expectedVariableRate
        .percentMul(8000)
        .percentMul(
          BigNumber.from(PERCENTAGE_FACTOR).sub(strategyDAI.reserveFactor)
        ),
      "Invalid liquidity rate"
    );

    expect(currentVariableBorrowRate).to.be.equal(
      expectedVariableRate,
      "Invalid variable rate"
    );

    if (DEBUG) {
      console.log(
        `Current Liquidity Rate: ${formatUnits(currentLiquidityRate, 27)}`
      );
      console.log(
        `Current Borrow Rate V : ${formatUnits(currentVariableBorrowRate, 27)}`
      );
    }
  });

  it("Checks rates at 100% usage ratio", async () => {
    const params: CalculateInterestRatesParams = {
      liquidityAdded: "0",
      liquidityTaken: 0,
      totalVariableDebt: "1000000000000000000",
      reserveFactor: strategyDAI.reserveFactor,
      reserve: dai.address,
      xToken: pDai.address,
    };

    const {0: currentLiquidityRate, 1: currentVariableBorrowRate} =
      await strategyInstance.calculateInterestRates(params);

    const expectedVariableRate = BigNumber.from(
      rateStrategyStableTwo.baseVariableBorrowRate
    )
      .add(rateStrategyStableTwo.variableRateSlope1)
      .add(rateStrategyStableTwo.variableRateSlope2);

    expect(currentLiquidityRate).to.be.equal(
      expectedVariableRate.percentMul(
        BigNumber.from(PERCENTAGE_FACTOR).sub(strategyDAI.reserveFactor)
      ),
      "Invalid liquidity rate"
    );

    expect(currentVariableBorrowRate).to.be.equal(
      expectedVariableRate,
      "Invalid variable rate"
    );

    if (DEBUG) {
      console.log(
        `Current Liquidity Rate: ${formatUnits(currentLiquidityRate, 27)}`
      );
      console.log(
        `Current Borrow Rate V : ${formatUnits(currentVariableBorrowRate, 27)}`
      );
    }
  });

  it("Checks rates at 0.8% usage", async () => {
    const params: CalculateInterestRatesParams = {
      liquidityAdded: "9920000000000000000000",
      liquidityTaken: 0,
      totalVariableDebt: "80000000000000000000",
      reserveFactor: strategyDAI.reserveFactor,
      reserve: dai.address,
      xToken: pDai.address,
    };

    const {0: currentLiquidityRate, 1: currentVariableBorrowRate} =
      await strategyInstance.calculateInterestRates(params);

    const usageRatio = BigNumber.from(1).ray().percentMul(80);
    const OPTIMAL_USAGE_RATIO = BigNumber.from(
      rateStrategyStableTwo.optimalUsageRatio
    );

    const expectedVariableRate = BigNumber.from(
      rateStrategyStableTwo.baseVariableBorrowRate
    ).add(
      BigNumber.from(rateStrategyStableTwo.variableRateSlope1).rayMul(
        usageRatio.rayDiv(OPTIMAL_USAGE_RATIO)
      )
    );

    expect(currentLiquidityRate).to.be.equal(
      expectedVariableRate
        .percentMul(80)
        .percentMul(
          BigNumber.from(PERCENTAGE_FACTOR).sub(strategyDAI.reserveFactor)
        ),
      "Invalid liquidity rate"
    );

    expect(currentVariableBorrowRate).to.be.equal(
      expectedVariableRate,
      "Invalid variable rate"
    );

    if (DEBUG) {
      console.log(
        `Current Liquidity Rate: ${formatUnits(currentLiquidityRate, 27)}`
      );
      console.log(
        `Current Borrow Rate V : ${formatUnits(currentVariableBorrowRate, 27)}`
      );
    }
  });

  it("Checks getters", async () => {
    expect(await strategyInstance.OPTIMAL_USAGE_RATIO()).to.be.eq(
      rateStrategyStableTwo.optimalUsageRatio
    );
    expect(await strategyInstance.getBaseVariableBorrowRate()).to.be.eq(
      rateStrategyStableTwo.baseVariableBorrowRate
    );
    expect(await strategyInstance.getVariableRateSlope1()).to.be.eq(
      rateStrategyStableTwo.variableRateSlope1
    );
    expect(await strategyInstance.getVariableRateSlope2()).to.be.eq(
      rateStrategyStableTwo.variableRateSlope2
    );
    expect(await strategyInstance.getMaxVariableBorrowRate()).to.be.eq(
      BigNumber.from(rateStrategyStableTwo.baseVariableBorrowRate)
        .add(BigNumber.from(rateStrategyStableTwo.variableRateSlope1))
        .add(BigNumber.from(rateStrategyStableTwo.variableRateSlope2))
    );
    expect(await strategyInstance.MAX_EXCESS_USAGE_RATIO()).to.be.eq(
      BigNumber.from(1).ray().sub(rateStrategyStableTwo.optimalUsageRatio)
    );
  });

  it("Deploy an interest rate strategy with optimalUsageRatio out of range (expect revert)", async () => {
    const {addressesProvider} = testEnv;

    await expect(
      deployReserveInterestRateStrategy(
        eContractid.DefaultReserveInterestRateStrategy,
        [
          addressesProvider.address,
          utils.parseUnits("1.0", 28).toString(),
          rateStrategyStableTwo.baseVariableBorrowRate,
          rateStrategyStableTwo.variableRateSlope1,
          rateStrategyStableTwo.variableRateSlope2,
        ]
      )
    ).to.be.revertedWith(INVALID_OPTIMAL_USAGE_RATIO);
  });
});
