import {expect} from "chai";
import {ONE_YEAR} from "../deploy/helpers/constants";
import {advanceTimeAndBlock} from "../deploy/helpers/misc-utils";
import {makeSuite} from "./helpers/make-suite";
import {snapshot} from "./helpers/snapshot-manager";
import {
  assertHealthFactorCalculation,
  borrowAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";

makeSuite("Health Factor tests", (testEnv) => {
  const firstDaiDeposit = "10000";
  let snapthotId: string;

  beforeEach("Take Blockchain Snapshot", async () => {
    snapthotId = await snapshot.take();
  });

  afterEach("Revert Blockchain to Snapshot", async () => {
    await snapshot.revert(snapthotId);
  });

  it("User 1 adds liquidity into the pool - 100 years later, health factor is the same.", async () => {
    const {
      users: [user1],
      pool,
      dai,
    } = testEnv;

    // User 1 - Deposit DAI
    await supplyAndValidate(dai, firstDaiDeposit, user1, true);

    const initialHealthFactor = (await pool.getUserAccountData(user1.address))
      .healthFactor;
    await assertHealthFactorCalculation(user1);

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR) * 100);

    // health factor should remain the same
    expect(initialHealthFactor).to.eq(
      (await pool.getUserAccountData(user1.address)).healthFactor
    );
  });

  it("User 1 and User 2 supply 10k into the pool, user 2 borrows 5k - 100 years later, iterests worsen User2's health factor.", async () => {
    const {
      users: [user1, user2],
      pool,
      dai,
    } = testEnv;

    // User 1 - Deposit 10k DAI
    await supplyAndValidate(dai, firstDaiDeposit, user1, true);
    // User 2 - Deposit 10k DAI
    await supplyAndValidate(dai, firstDaiDeposit, user2, true);
    // User 2 - Borrow 5k DAI
    await borrowAndValidate(dai, "5000", user2);

    const initialHealthFactor1 = (await pool.getUserAccountData(user1.address))
      .healthFactor;
    const initialHealthFactor2 = (await pool.getUserAccountData(user2.address))
      .healthFactor;

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR) * 100);

    // health factor is expected to have worsen for User 2 due to interests on his acquired debt
    expect(initialHealthFactor2).to.be.gt(
      (await pool.getUserAccountData(user2.address)).healthFactor
    );
    // health factor for user 1 should've remained the same
    expect(initialHealthFactor1).to.eq(
      (await pool.getUserAccountData(user1.address)).healthFactor
    );

    await assertHealthFactorCalculation(user1);
    await assertHealthFactorCalculation(user2);
  });

  it("User 1 supplies ERC721 into the pool - 100 years later, erc721 health factor is the same.", async () => {
    const {
      users: [user1],
      pool,
      bayc,
    } = testEnv;

    // User 1 - Deposit BAYC
    await supplyAndValidate(bayc, "1", user1, true);

    const initialHealthFactor = (await pool.getUserAccountData(user1.address))
      .erc721HealthFactor;

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR) * 100);

    // health factor should remain the same
    expect(initialHealthFactor).to.eq(
      (await pool.getUserAccountData(user1.address)).erc721HealthFactor
    );
  });

  it("User 1 supplies 10k DAI into the pool, user 2 supplies BAYC and borrows 5k DAI - 100 years later, interests worsen User2's erc-721 health factor.", async () => {
    const {
      users: [user1, user2],
      pool,
      dai,
      bayc,
    } = testEnv;

    // User 1 - Deposit 10k DAI
    await supplyAndValidate(dai, firstDaiDeposit, user1, true);
    // User 2 - Deposit 10k DAI
    await supplyAndValidate(bayc, "1", user2, true);
    // User 2 - Borrow 5k DAI
    await borrowAndValidate(dai, "5000", user2);

    const initialHealthFactor1 = (await pool.getUserAccountData(user1.address))
      .erc721HealthFactor;
    const initialHealthFactor2 = (await pool.getUserAccountData(user2.address))
      .erc721HealthFactor;

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR) * 100);

    // ERC721 health factor is expected to have worsen for User 2 due to interests on his acquired debt
    expect(initialHealthFactor2).to.be.gt(
      (await pool.getUserAccountData(user2.address)).erc721HealthFactor
    );
    // health factor for user 1 should've remained the same
    expect(initialHealthFactor1).to.eq(
      (await pool.getUserAccountData(user1.address)).erc721HealthFactor
    );
  });
});
