import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {parseEther, parseUnits} from "ethers/lib/utils";
import {
  deployETHValidatorStakingStrategy,
  deployInstantWithdraw,
} from "../helpers/contracts-deployments";
import {getCurrentTime} from "../helpers/contracts-helpers";
import {advanceTimeAndBlock, DRE, waitForTx} from "../helpers/misc-utils";
import {StakingProvider} from "../helpers/types";
import {testEnvFixture} from "./helpers/setup-env";
import {assertAlmostEqual} from "./helpers/validated-steps";
import {calcCompoundedInterest} from "./helpers/utils/calculations";
import "./helpers/utils/wadraymath";
import {ONE_YEAR, RAY} from "../helpers/constants";

const SECONDS_PER_YEAR = BigNumber.from(ONE_YEAR);
describe("ETH Withdrawal", async () => {
  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {gatewayAdmin} = testEnv;
    testEnv.ethWithdrawal = await deployInstantWithdraw("InstantWithdraw");
    const validatorStrategy = await deployETHValidatorStakingStrategy(
      "0", // staking rate
      parseUnits("13", 10).toString(),
      parseUnits("0.05", 27).toString(),
      parseUnits("4.32", 6).toString()
    );

    await testEnv.ethWithdrawal
      .connect(gatewayAdmin.signer)
      .setProviderStrategyAddress(0, validatorStrategy.address);
    return testEnv;
  };

  const calculateDiscountRate = async (
    providerPremium: BigNumber,
    borrowRate: BigNumber,
    timeUntilWithdrawal: BigNumber,
    durationFactor: BigNumber
  ) => {
    // r_discount = r_base_vendor +  (borrowRate * T) / durationFactor
    return providerPremium.add(
      borrowRate.mul(timeUntilWithdrawal).div(durationFactor)
    );
  };

  const calculatePresentValue = async (
    principal: BigNumber,
    discountRate: BigNumber,
    stakingRate: BigNumber,
    slashingRate: BigNumber,
    timeUntilWithdrawal: BigNumber,
    currentTime: BigNumber
  ) => {
    if (currentTime >= timeUntilWithdrawal) {
      return principal;
    }

    // presentValue = (principal * (1 - slashinkRate * T)) / (1 + discountRate)^T + rewards * (1 - 1/(1 + discountRate)^T) / discountRate

    const comppoundedInterestFromDiscountRate = calcCompoundedInterest(
      discountRate,
      timeUntilWithdrawal,
      currentTime
    );

    const timeUntilRedemption = timeUntilWithdrawal.sub(currentTime);

    // TODO finalize staking rewards calculation for partial collateral
    const scaledUpStakingReward = stakingRate
      .wadToRay()
      .mul(timeUntilRedemption)
      .mul(RAY);

    const scaledPrincipal = principal.wadToRay();

    const principalAfterSlashingRisk = scaledPrincipal.sub(
      scaledPrincipal
        .mul(slashingRate)
        .mul(timeUntilRedemption)
        .div(SECONDS_PER_YEAR.mul(RAY))
    );

    const tokenPrice = principalAfterSlashingRisk
      .rayDiv(comppoundedInterestFromDiscountRate)
      .add(
        scaledUpStakingReward
          .sub(scaledUpStakingReward.div(comppoundedInterestFromDiscountRate))
          .div(discountRate.div(SECONDS_PER_YEAR))
      );

    return tokenPrice.rayToWad();
  };

  it("TC-eth-withdrawal-01: Check we can mint ETH withdrawal NFT", async () => {
    const {ethWithdrawal, gatewayAdmin} = await loadFixture(fixture);
    const currentTime = await getCurrentTime();
    await waitForTx(
      await ethWithdrawal
        .connect(gatewayAdmin.signer)
        .mint(
          StakingProvider.Validator,
          "1111",
          "1111",
          parseEther("32").toString(),
          gatewayAdmin.address,
          currentTime.add(30 * 24 * 3600)
        )
    );

    expect(
      await ethWithdrawal
        .connect(gatewayAdmin.signer)
        .balanceOf(gatewayAdmin.address, "0")
    ).eq("10000");
  });

  it("TC-eth-withdrawal-02: ETH withdrawal NFT should return the present value and discount rate for full balance with 30% borrow rate", async () => {
    const {
      ethWithdrawal,
      gatewayAdmin,
      users: [user1],
    } = await loadFixture(fixture);
    const currentTime = await getCurrentTime();
    await waitForTx(
      await ethWithdrawal
        .connect(gatewayAdmin.signer)
        .mint(
          StakingProvider.Validator,
          "1111",
          "1111",
          parseEther("32").toString(),
          gatewayAdmin.address,
          currentTime.add(30 * 24 * 3600)
        )
    );

    // (1 + 0.3 / 31536000) ** (30 * 24 * 3600) = 1.0249640452079391053
    // 32 / 1.0249640452079391053 = 31.220607346775773819

    const {price, discountRate} = await ethWithdrawal
      .connect(user1.signer)
      .getPresentValueAndDiscountRate("0", 10000, parseUnits("0.3", 27));

    assertAlmostEqual(
      price,
      await calculatePresentValue(
        parseEther("32"),
        discountRate,
        BigNumber.from(1),
        parseUnits("13", 10),
        currentTime.add(30 * 24 * 3600),
        currentTime
      )
    );
    assertAlmostEqual(
      discountRate,
      await calculateDiscountRate(
        parseUnits("0.05", 27),
        parseUnits("0.3", 27),
        BigNumber.from(30 * 24 * 3600),
        parseUnits("4.32", 6)
      )
    );

    await advanceTimeAndBlock(30 * 24 * 3600);

    expect(
      (
        await ethWithdrawal
          .connect(user1.signer)
          .getPresentValueAndDiscountRate("0", 10000, parseUnits("0.3", 27))
      ).price
    ).to.be.equal(parseEther("32"));
  });

  it("TC-eth-withdrawal-03: ETH withdrawal NFT should return the present value and discount rate for partial balance with 30% borrow rate", async () => {
    const {
      ethWithdrawal,
      gatewayAdmin,
      users: [user1],
    } = await loadFixture(fixture);
    const currentTime = await getCurrentTime();
    await waitForTx(
      await ethWithdrawal
        .connect(gatewayAdmin.signer)
        .mint(
          StakingProvider.Validator,
          "1111",
          "1111",
          parseEther("32").toString(),
          gatewayAdmin.address,
          currentTime.add(30 * 24 * 3600)
        )
    );

    // (1 + 0.3 / 31536000) ** (30 * 24 * 3600) = 1.0249640452079391053
    // 32 / 1.0249640452079391053 = 31.220607346775773819

    const {price, discountRate} = await ethWithdrawal
      .connect(user1.signer)
      .getPresentValueAndDiscountRate("0", 5000, parseUnits("0.3", 27));

    assertAlmostEqual(
      price,
      await calculatePresentValue(
        parseEther("16"),
        discountRate,
        BigNumber.from(1),
        parseUnits("13", 10),
        currentTime.add(30 * 24 * 3600),
        currentTime
      )
    );
    assertAlmostEqual(
      discountRate,
      await calculateDiscountRate(
        parseUnits("0.05", 27),
        parseUnits("0.3", 27),
        BigNumber.from(30 * 24 * 3600),
        parseUnits("4.32", 6)
      )
    );

    await advanceTimeAndBlock(30 * 24 * 3600);

    expect(
      (
        await ethWithdrawal
          .connect(user1.signer)
          .getPresentValueAndDiscountRate("0", 5000, parseUnits("0.3", 27))
      ).price
    ).to.be.equal(parseEther("16"));
  });

  it("TC-eth-withdrawal-04: Admin of ETH withdrawal NFT can change the present value strategy contract address ", async () => {
    const {
      ethWithdrawal,
      gatewayAdmin,
      users: [user1],
    } = await loadFixture(fixture);
    const currentTime = await getCurrentTime();
    await waitForTx(
      await ethWithdrawal
        .connect(gatewayAdmin.signer)
        .mint(
          StakingProvider.Validator,
          "1111",
          "1111",
          parseEther("32").toString(),
          gatewayAdmin.address,
          currentTime.add(30 * 24 * 3600)
        )
    );

    // (1 + 0.3 / 31536000) ** (30 * 24 * 3600) = 1.0249640452079391053
    // 32 / 1.0249640452079391053 = 31.220607346775773819
    let price, discountRate;

    [price, discountRate] = await ethWithdrawal
      .connect(user1.signer)
      .getPresentValueAndDiscountRate("0", 5000, parseUnits("0.3", 27));

    assertAlmostEqual(
      price,
      await calculatePresentValue(
        parseEther("16"),
        discountRate,
        BigNumber.from(1),
        parseUnits("13", 10),
        currentTime.add(30 * 24 * 3600),
        currentTime
      )
    );
    assertAlmostEqual(
      discountRate,
      await calculateDiscountRate(
        parseUnits("0.05", 27),
        parseUnits("0.3", 27),
        BigNumber.from(30 * 24 * 3600),
        parseUnits("4.32", 6)
      )
    );

    const validatorStrategy = await deployETHValidatorStakingStrategy(
      "0", // staking rate
      parseUnits("13", 15).toString(),
      parseUnits("0.10", 27).toString(),
      parseUnits("4.32", 6).toString()
    );

    await ethWithdrawal
      .connect(gatewayAdmin.signer)
      .setProviderStrategyAddress(0, validatorStrategy.address);

    [price, discountRate] = await ethWithdrawal
      .connect(user1.signer)
      .getPresentValueAndDiscountRate("0", 5000, parseUnits("0.3", 27));

    assertAlmostEqual(
      price,
      await calculatePresentValue(
        parseEther("16"),
        discountRate,
        BigNumber.from(0),
        parseUnits("13", 15),
        currentTime.add(30 * 24 * 3600),
        currentTime
      )
    );
    assertAlmostEqual(
      discountRate,
      await calculateDiscountRate(
        parseUnits("0.10", 27),
        parseUnits("0.3", 27),
        BigNumber.from(30 * 24 * 3600),
        parseUnits("4.32", 6)
      )
    );
  });

  it("TC-eth-withdrawal-05: non-admin of ETH withdrawal NFT can't change the present value strategy contract address ", async () => {
    const {
      ethWithdrawal,
      users: [, user2],
    } = await loadFixture(fixture);

    const validatorStrategy = await deployETHValidatorStakingStrategy(
      "0", // staking rate
      parseUnits("13", 15).toString(),
      parseUnits("0.10", 27).toString(),
      parseUnits("4.32", 6).toString()
    );

    await expect(
      ethWithdrawal
        .connect(user2.signer)
        .setProviderStrategyAddress(0, validatorStrategy.address)
    ).to.be.reverted;
  });

  it("TC-eth-withdrawal-06: Check we can burn ETH withdrawal NFT", async () => {
    const {
      ethWithdrawal,
      gatewayAdmin,
      users: [user1],
    } = await loadFixture(fixture);
    const currentTime = await getCurrentTime();
    await waitForTx(
      await ethWithdrawal
        .connect(gatewayAdmin.signer)
        .mint(
          StakingProvider.Validator,
          1111,
          1111,
          parseEther("32"),
          gatewayAdmin.address,
          currentTime.add(30 * 24 * 3600),
          {gasLimit: 5000000}
        )
    );

    expect(
      await ethWithdrawal
        .connect(gatewayAdmin.signer)
        .balanceOf(gatewayAdmin.address, "0")
    ).to.be.equal(10000);

    await advanceTimeAndBlock(30 * 24 * 3600);

    await waitForTx(
      await user1.signer.sendTransaction({
        to: ethWithdrawal.address,
        value: parseEther("32"),
      })
    );

    await waitForTx(
      await ethWithdrawal
        .connect(gatewayAdmin.signer)
        .burn("0", gatewayAdmin.address, 10000)
    );

    expect(
      await DRE.ethers.provider.getBalance(ethWithdrawal.address)
    ).to.be.equal(0);
  });
});
