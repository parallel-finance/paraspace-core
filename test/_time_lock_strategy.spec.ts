import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {ZERO_ADDRESS} from "../helpers/constants";
import {deployDefaultTimeLockStrategy} from "../helpers/contracts-deployments";
import {advanceTimeAndBlock, timeLatest} from "../helpers/misc-utils";
import {DefaultTimeLockStrategy} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

describe("defaultTimeLockStrategy tests", function () {
  let defaultTimeLockStrategy: DefaultTimeLockStrategy;
  let testEnv: TestEnv;
  let user1;

  const minThreshold = BigNumber.from(10);
  const midThreshold = BigNumber.from(20);
  const minWaitTime = 10;
  const midWaitTime = 200;
  const maxWaitTime = 3600;
  const poolPeriodLimit = BigNumber.from(400);
  const poolPeriodWaitTime = 40;
  const period = 86400;
  const amountBelowMinThreshold = minThreshold.sub(2);
  const amountBetweenMinAndMidThreshold = minThreshold.add(2);
  const amountAboveMidThreshold = midThreshold.add(2);

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {users} = testEnv;

    user1 = users[0];

    defaultTimeLockStrategy = await deployDefaultTimeLockStrategy(
      minThreshold.toString(),
      midThreshold.toString(),
      minWaitTime.toString(),
      midWaitTime.toString(),
      maxWaitTime.toString(),
      poolPeriodLimit.toString(),
      poolPeriodWaitTime.toString(),
      period.toString()
    );
  });

  it("should initialize the contract with correct values", async function () {
    expect(await defaultTimeLockStrategy.MIN_THRESHOLD()).to.equal(
      minThreshold
    );
    expect(await defaultTimeLockStrategy.MID_THRESHOLD()).to.equal(
      midThreshold
    );
    expect(await defaultTimeLockStrategy.MIN_WAIT_TIME()).to.equal(minWaitTime);
    expect(await defaultTimeLockStrategy.MID_WAIT_TIME()).to.equal(midWaitTime);
    expect(await defaultTimeLockStrategy.MAX_WAIT_TIME()).to.equal(maxWaitTime);
    expect(await defaultTimeLockStrategy.POOL_PERIOD_LIMIT()).to.equal(
      poolPeriodLimit
    );
    expect(await defaultTimeLockStrategy.POOL_PERIOD_RATE_WAIT_TIME()).to.equal(
      poolPeriodWaitTime
    );
    expect(await defaultTimeLockStrategy.PERIOD()).to.equal(period);
  });

  it("should update total amount and calculate time lock params correctly", async function () {
    const {
      users: [user1],
    } = testEnv;

    const amount = minThreshold;
    const timeLockParams = await defaultTimeLockStrategy
      .connect(user1.signer)
      .callStatic.calculateTimeLockParams({
        amount: amount,
        asset: ZERO_ADDRESS,
        assetType: 0,
      });
    expect(timeLockParams.releaseTime).to.be.gte(minWaitTime);
    await defaultTimeLockStrategy
      .connect(user1.signer)
      .calculateTimeLockParams({
        amount: amount,
        asset: ZERO_ADDRESS,
        assetType: 0,
      });
    expect(await defaultTimeLockStrategy.totalAmountInCurrentPeriod()).to.eq(
      amount
    );
  });

  it("should set the correct release time for an amount below the min threshold", async function () {
    const currentTime = (await timeLatest()).toNumber();
    const timeLockParams = await defaultTimeLockStrategy
      .connect(user1.signer)
      .callStatic.calculateTimeLockParams({
        amount: amountBelowMinThreshold,
        asset: ZERO_ADDRESS,
        assetType: 0,
      });
    const expectedReleaseTime = currentTime + minWaitTime;
    expect(timeLockParams.releaseTime).to.be.closeTo(expectedReleaseTime, 15);
  });

  it("should set the correct release time for an amount between min and mid threshold", async function () {
    const timeLockParams = await defaultTimeLockStrategy
      .connect(user1.signer)
      .callStatic.calculateTimeLockParams({
        amount: amountBetweenMinAndMidThreshold,
        asset: ZERO_ADDRESS,
        assetType: 0,
      });
    const currentTime = (await timeLatest()).toNumber();
    const expectedReleaseTime = currentTime + midWaitTime;
    expect(timeLockParams.releaseTime).to.be.closeTo(expectedReleaseTime, 15);
  });

  it("should set the correct release time for an amount above the mid threshold", async function () {
    const timeLockParams = await defaultTimeLockStrategy
      .connect(user1.signer)
      .callStatic.calculateTimeLockParams({
        amount: amountAboveMidThreshold,
        asset: ZERO_ADDRESS,
        assetType: 0,
      });
    const currentTime = (await timeLatest()).toNumber();
    const expectedReleaseTime = currentTime + maxWaitTime;
    expect(timeLockParams.releaseTime).to.be.closeTo(expectedReleaseTime, 15);
  });

  it("should reset the period and emit a PeriodReset event when the period has elapsed", async function () {
    const initialLastResetTimestamp =
      await defaultTimeLockStrategy.lastResetTimestamp();
    await advanceTimeAndBlock(period);
    // Call calculateTimeLockParams again, which should trigger a period reset
    await expect(
      defaultTimeLockStrategy.connect(user1.signer).calculateTimeLockParams({
        amount: amountBelowMinThreshold,
        asset: ZERO_ADDRESS,
        assetType: 0,
      })
    ).to.emit(defaultTimeLockStrategy, "PeriodReset");

    const newLastResetTimestamp =
      await defaultTimeLockStrategy.lastResetTimestamp();
    expect(newLastResetTimestamp).to.be.greaterThan(initialLastResetTimestamp);
  });

  it("should add POOL_PERIOD_RATE_WAIT_TIME when the updated total amount is greater than MAX_POOL_PERIOD_RATE", async function () {
    // Set totalAmountInCurrentPeriod to a value greater than MAX_POOL_PERIOD_RATE
    await defaultTimeLockStrategy
      .connect(user1.signer)
      .calculateTimeLockParams({
        amount: poolPeriodLimit.mul(2),
        asset: ZERO_ADDRESS,
        assetType: 0,
      });

    const timeLockParams = await defaultTimeLockStrategy
      .connect(user1.signer)
      .callStatic.calculateTimeLockParams({
        amount: amountBelowMinThreshold,
        asset: ZERO_ADDRESS,
        assetType: 0,
      });
    const currentTime = (await timeLatest()).toNumber();
    const expectedReleaseTime = currentTime + minWaitTime + poolPeriodWaitTime;
    expect(timeLockParams.releaseTime).to.be.closeTo(expectedReleaseTime, 15);
  });
});
