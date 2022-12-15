import {expect} from "chai";
import {MAX_UINT_AMOUNT, ONE_YEAR} from "../helpers/constants";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {advanceTimeAndBlock} from "../helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import "./helpers/utils/wadraymath";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";

describe("Mint To Treasury", () => {
  let testEnv: TestEnv;
  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
  });
  it("TC-pool-mint-to-treasury-01 User 0 deposits 1000 DAI. Borrower borrows 100 DAI. Clock moved forward one year. Calculates and verifies the amount accrued to the treasury", async () => {
    const {users, pool, dai, protocolDataProvider} = testEnv;

    const amountDAItoDeposit = await convertToCurrencyDecimals(
      dai.address,
      "1000"
    );
    const amountDAItoBorrow = await convertToCurrencyDecimals(
      dai.address,
      "100"
    );

    await expect(
      await dai.connect(users[0].signer)["mint(uint256)"](amountDAItoDeposit)
    );

    // user 0 deposits 1000 DAI
    await expect(
      await dai.connect(users[0].signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await expect(
      await pool
        .connect(users[0].signer)
        .supply(dai.address, amountDAItoDeposit, users[0].address, "0")
    );

    await expect(
      await pool
        .connect(users[0].signer)
        .borrow(dai.address, amountDAItoBorrow, "0", users[0].address)
    );

    const {reserveFactor} =
      await protocolDataProvider.getReserveConfigurationData(dai.address);

    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    await expect(
      await dai.connect(users[0].signer)["mint(uint256)"](amountDAItoDeposit)
    );

    await expect(
      await pool
        .connect(users[0].signer)
        .supply(dai.address, amountDAItoDeposit, users[0].address, "0")
    );

    const {liquidityIndex, variableBorrowIndex} = await pool.getReserveData(
      dai.address
    );

    const expectedAccruedToTreasury = amountDAItoBorrow
      .rayMul(variableBorrowIndex)
      .sub(amountDAItoBorrow)
      .percentMul(reserveFactor)
      .rayDiv(liquidityIndex);

    const {accruedToTreasury} = await pool.getReserveData(dai.address);

    expect(accruedToTreasury).to.be.closeTo(expectedAccruedToTreasury, 2);
  });

  it("TC-pool-mint-to-treasury-02 Mints the accrued to the treasury", async () => {
    const {users, pool, dai, pDai} = testEnv;

    const treasuryAddress = await pDai.RESERVE_TREASURY_ADDRESS();
    const {accruedToTreasury} = await pool.getReserveData(dai.address);

    await expect(
      await pool.connect(users[0].signer).mintToTreasury([dai.address])
    );

    const normalizedIncome = await pool.getReserveNormalizedIncome(dai.address);
    const treasuryBalance = await pDai.balanceOf(treasuryAddress);

    const expectedTreasuryBalance = accruedToTreasury.rayMul(normalizedIncome);

    expect(treasuryBalance).to.be.closeTo(
      expectedTreasuryBalance,
      2,
      "Invalid treasury balance after minting"
    );
  });

  it("TC-pool-mint-to-treasury-03 Call `mintToTreasury()` on a pool with an inactive reserve", async () => {
    const {pool, poolAdmin, dai, users, configurator} = await loadFixture(
      testEnvFixture
    );

    // Deactivate reserve
    expect(
      await configurator
        .connect(poolAdmin.signer)
        .setReserveActive(dai.address, false)
    );

    // MintToTreasury
    expect(await pool.connect(users[0].signer).mintToTreasury([dai.address]));
  });
});
