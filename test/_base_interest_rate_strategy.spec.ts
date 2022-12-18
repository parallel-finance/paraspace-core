import {expect} from "chai";
import {BigNumber, BigNumberish, utils} from "ethers";
import {
  deployReserveAuctionStrategy,
  deployReserveInterestRateStrategy,
} from "../helpers/contracts-deployments";
import {
  MAX_UINT_AMOUNT,
  PERCENTAGE_FACTOR,
  ZERO_ADDRESS,
} from "../helpers/constants";
import {
  PToken,
  DefaultReserveInterestRateStrategy,
  MintableERC20,
  MockReserveInterestRateStrategy,
  DefaultReserveAuctionStrategy,
  MintableERC20__factory,
  VariableDebtToken__factory,
  MockReserveInterestRateStrategy__factory,
  PToken__factory,
} from "../types";
import {strategyDAI} from "../market-config/reservesConfigs";
import {rateStrategyStableTwo} from "../market-config/rateStrategies";
import {TestEnv} from "./helpers/make-suite";
import "./helpers/utils/wadraymath";
import {eContractid, ProtocolErrors} from "../helpers/types";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {getFirstSigner, getAggregator} from "../helpers/contracts-getters";
import {auctionStrategyExp} from "../market-config/auctionStrategies";
import {ConfiguratorInputTypes} from "../types/interfaces/IPoolConfigurator";
import {
  convertToCurrencyDecimals,
  impersonateAddress,
} from "../helpers/contracts-helpers";
import {increaseTime} from "../helpers/misc-utils";
import {topUpNonPayableWithEther} from "./helpers/utils/funds";
import {ETHERSCAN_VERIFICATION} from "../helpers/hardhat-constants";

type CalculateInterestRatesParams = {
  liquidityAdded: BigNumberish;
  liquidityTaken: BigNumberish;
  totalVariableDebt: BigNumberish;
  reserveFactor: BigNumberish;
  reserve: string;
  xToken: string;
};

const SAFECAST_UINT128_OVERFLOW = "SafeCast: value doesn't fit in 128 bits";

describe("Interest Rate Tests", () => {
  context("InterestRateStrategy", () => {
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
        ],
        ETHERSCAN_VERIFICATION
      );
    });

    it("TC-interest-rate-strategy-01 Checks rates at 0% usage ratio, empty reserve", async () => {
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

    it("TC-interest-rate-strategy-02 Checks rates at 80% usage ratio", async () => {
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
    });

    it("TC-interest-rate-strategy-03 Checks rates at 100% usage ratio", async () => {
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
    });

    it("TC-interest-rate-strategy-04 Checks rates at 0.8% usage", async () => {
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
    });

    it("TC-interest-rate-strategy-05 Checks getters", async () => {
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

    it("TC-interest-rate-strategy-06 Deploy an interest rate strategy with optimalUsageRatio out of range (expect revert)", async () => {
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

    it("TC-interest-rate-strategy-07 PoolConfigurator updates the ReserveInterestRateStrategy address", async () => {
      const {pool, deployer, dai, configurator} = await loadFixture(
        testEnvFixture
      );

      // Impersonate PoolConfigurator
      await topUpNonPayableWithEther(
        deployer.signer,
        [configurator.address],
        utils.parseEther("1")
      );
      const configSigner = (await impersonateAddress(configurator.address))
        .signer;

      expect(
        await pool
          .connect(configSigner)
          .setReserveInterestRateStrategyAddress(dai.address, ZERO_ADDRESS)
      );

      const config = await pool.getReserveData(dai.address);
      expect(config.interestRateStrategyAddress).to.be.eq(ZERO_ADDRESS);
    });
  });

  context("Interest Rate and Index Overflow", () => {
    let mockToken: MintableERC20;
    let mockRateStrategy: MockReserveInterestRateStrategy;
    let mockAuctionStrategy: DefaultReserveAuctionStrategy;
    let testEnv: TestEnv;

    const fixture = async () => {
      const testEnv = await loadFixture(testEnvFixture);
      const {
        pool,
        poolAdmin,
        configurator,
        dai,
        paraspaceOracle,
        protocolDataProvider,
        addressesProvider,
      } = testEnv;

      mockToken = await new MintableERC20__factory(
        await getFirstSigner()
      ).deploy("MOCK", "MOCK", "18");

      const variableDebtTokenImplementation =
        await new VariableDebtToken__factory(await getFirstSigner()).deploy(
          pool.address
        );
      const xTokenImplementation = await new PToken__factory(
        await getFirstSigner()
      ).deploy(pool.address);

      mockRateStrategy = await new MockReserveInterestRateStrategy__factory(
        await getFirstSigner()
      ).deploy(addressesProvider.address, 0, 0, 0, 0);

      mockAuctionStrategy = await deployReserveAuctionStrategy(
        eContractid.DefaultReserveAuctionStrategy,
        [
          auctionStrategyExp.maxPriceMultiplier,
          auctionStrategyExp.minExpPriceMultiplier,
          auctionStrategyExp.minPriceMultiplier,
          auctionStrategyExp.stepLinear,
          auctionStrategyExp.stepExp,
          auctionStrategyExp.tickLength,
        ],
        ETHERSCAN_VERIFICATION
      );

      // Init the reserve
      const initInputParams: ConfiguratorInputTypes.InitReserveInputStruct[] = [
        {
          xTokenImpl: xTokenImplementation.address,
          variableDebtTokenImpl: variableDebtTokenImplementation.address,
          underlyingAssetDecimals: 18,
          interestRateStrategyAddress: mockRateStrategy.address,
          auctionStrategyAddress: mockAuctionStrategy.address,
          assetType: 0,
          underlyingAsset: mockToken.address,
          treasury: ZERO_ADDRESS,
          incentivesController: ZERO_ADDRESS,
          xTokenName: "PMOCK",
          xTokenSymbol: "PMOCK",
          variableDebtTokenName: "VMOCK",
          variableDebtTokenSymbol: "VMOCK",
          params: "0x10",
        },
      ];

      await configurator
        .connect(poolAdmin.signer)
        .initReserves(initInputParams);

      // Configuration
      const daiReserveConfigurationData =
        await protocolDataProvider.getReserveConfigurationData(dai.address);

      const maxCap = 68719476735;
      const inputParams: {
        asset: string;
        baseLTV: BigNumberish;
        liquidationThreshold: BigNumberish;
        liquidationBonus: BigNumberish;
        reserveFactor: BigNumberish;
        borrowCap: BigNumberish;
        supplyCap: BigNumberish;
        borrowingEnabled: boolean;
      }[] = [
        {
          asset: mockToken.address,
          baseLTV: daiReserveConfigurationData.ltv,
          liquidationThreshold:
            daiReserveConfigurationData.liquidationThreshold,
          liquidationBonus: daiReserveConfigurationData.liquidationBonus,
          reserveFactor: daiReserveConfigurationData.reserveFactor,
          borrowCap: maxCap,
          supplyCap: maxCap,
          borrowingEnabled: true,
        },
      ];

      const i = 0;
      await configurator
        .connect(poolAdmin.signer)
        .configureReserveAsCollateral(
          inputParams[i].asset,
          inputParams[i].baseLTV,
          inputParams[i].liquidationThreshold,
          inputParams[i].liquidationBonus
        );
      await configurator
        .connect(poolAdmin.signer)
        .setReserveBorrowing(inputParams[i].asset, true);

      await configurator
        .connect(poolAdmin.signer)
        .setSupplyCap(inputParams[i].asset, inputParams[i].supplyCap);
      await configurator
        .connect(poolAdmin.signer)
        .setReserveFactor(inputParams[i].asset, inputParams[i].reserveFactor);

      await paraspaceOracle.setAssetSources(
        [mockToken.address],
        [(await getAggregator(undefined, "DAI")).address]
      );

      return testEnv;
    };

    beforeEach(async () => {
      testEnv = await loadFixture(fixture);
    });

    it("TC-interest-rate-overflow-01 ReserveLogic `updateInterestRates` with nextLiquidityRate > type(uint128).max (revert expected)", async () => {
      const {
        pool,
        users: [user],
      } = testEnv;

      await mockToken
        .connect(user.signer)
        ["mint(uint256)"](
          await convertToCurrencyDecimals(mockToken.address, "10000")
        );
      await mockToken
        .connect(user.signer)
        .approve(pool.address, MAX_UINT_AMOUNT);

      await mockRateStrategy.setLiquidityRate(MAX_UINT_AMOUNT);

      await expect(
        pool
          .connect(user.signer)
          .supply(
            mockToken.address,
            await convertToCurrencyDecimals(mockToken.address, "1000"),
            user.address,
            0
          )
      ).to.be.revertedWith(SAFECAST_UINT128_OVERFLOW);
    });

    it("TC-interest-rate-overflow-02 ReserveLogic `updateInterestRates` with nextVariableRate > type(uint128).max (revert expected)", async () => {
      const {
        pool,
        users: [user],
      } = testEnv;

      await mockToken
        .connect(user.signer)
        ["mint(uint256)"](
          await convertToCurrencyDecimals(mockToken.address, "10000")
        );
      await mockToken
        .connect(user.signer)
        .approve(pool.address, MAX_UINT_AMOUNT);

      await mockRateStrategy.setVariableBorrowRate(MAX_UINT_AMOUNT);

      await expect(
        pool
          .connect(user.signer)
          .supply(
            mockToken.address,
            await convertToCurrencyDecimals(mockToken.address, "1000"),
            user.address,
            0
          )
      ).to.be.revertedWith(SAFECAST_UINT128_OVERFLOW);
    });

    it("TC-reserve-indexes-overflow-01 ReserveLogic `_updateIndexes` with nextLiquidityIndex > type(uint128).max (revert expected)", async () => {
      const {
        pool,
        users: [user],
        dai,
      } = testEnv;

      await dai
        .connect(user.signer)
        ["mint(uint256)"](
          await convertToCurrencyDecimals(mockToken.address, "10000")
        );
      await dai.connect(user.signer).approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(user.signer)
        .supply(
          dai.address,
          await convertToCurrencyDecimals(mockToken.address, "1000"),
          user.address,
          0
        );

      await mockToken
        .connect(user.signer)
        ["mint(uint256)"](
          await convertToCurrencyDecimals(mockToken.address, "1000")
        );
      await mockToken
        .connect(user.signer)
        .approve(pool.address, MAX_UINT_AMOUNT);

      await pool
        .connect(user.signer)
        .supply(
          mockToken.address,
          await convertToCurrencyDecimals(mockToken.address, "1000"),
          user.address,
          0
        );
      // Set liquidity rate to max
      await mockRateStrategy.setLiquidityRate(
        BigNumber.from(2).pow(128).sub(1)
      );

      // Borrow funds
      await pool
        .connect(user.signer)
        .borrow(
          mockToken.address,
          await convertToCurrencyDecimals(mockToken.address, "100"),
          0,
          user.address
        );

      // set borrow rate to max
      await mockRateStrategy.setVariableBorrowRate(
        BigNumber.from(2).pow(128).sub(1)
      );

      // Increase time such that the next liquidity index overflow because of interest
      await increaseTime(60 * 60 * 24 * 500);

      await expect(
        pool
          .connect(user.signer)
          .supply(
            mockToken.address,
            await convertToCurrencyDecimals(mockToken.address, "1000"),
            user.address,
            0
          )
      ).to.be.revertedWith(SAFECAST_UINT128_OVERFLOW);
    });

    it("TC-reserve-indexes-overflow-02 ReserveLogic `_updateIndexes` with nextVariableBorrowIndex > type(uint128).max (revert expected)", async () => {
      const {
        pool,
        users: [user],
        dai,
      } = testEnv;

      await dai
        .connect(user.signer)
        ["mint(uint256)"](
          await convertToCurrencyDecimals(mockToken.address, "10000")
        );
      await dai.connect(user.signer).approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(user.signer)
        .supply(
          dai.address,
          await convertToCurrencyDecimals(mockToken.address, "10000"),
          user.address,
          0
        );

      await mockToken
        .connect(user.signer)
        ["mint(uint256)"](
          await convertToCurrencyDecimals(mockToken.address, "10000")
        );
      await mockToken
        .connect(user.signer)
        .approve(pool.address, MAX_UINT_AMOUNT);

      await pool
        .connect(user.signer)
        .supply(
          mockToken.address,
          await convertToCurrencyDecimals(mockToken.address, "1000"),
          user.address,
          0
        );

      await mockRateStrategy.setLiquidityRate(BigNumber.from(10).pow(27));
      await mockRateStrategy.setVariableBorrowRate(
        BigNumber.from(2).pow(110).sub(1)
      );
      await pool
        .connect(user.signer)
        .borrow(
          mockToken.address,
          await convertToCurrencyDecimals(mockToken.address, "100"),
          0,
          user.address
        );

      await increaseTime(60 * 60 * 24 * 365);

      await expect(
        pool
          .connect(user.signer)
          .supply(
            mockToken.address,
            await convertToCurrencyDecimals(mockToken.address, "1000"),
            user.address,
            0
          )
      ).to.be.revertedWith(SAFECAST_UINT128_OVERFLOW);
    });
  });
});
