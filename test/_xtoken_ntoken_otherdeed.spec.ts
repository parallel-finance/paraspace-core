import {expect} from "chai";
import {timeLatest} from "../helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {HotWalletProxy} from "../types";
import {getHotWalletProxy} from "../helpers/contracts-getters";
import {ZERO_ADDRESS} from "../helpers/constants";
import {
  borrowAndValidate,
  changePriceAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {ProtocolErrors} from "../helpers/types";
import {ethers} from "hardhat";
import {BigNumber} from "ethers";

describe("Otherdeed nToken warmwallet delegation", () => {
  let testEnv: TestEnv;
  let hotWallet: HotWalletProxy;

  beforeEach(async () => {
    testEnv = await loadFixture(testEnvFixture);

    const {
      users: [user1],
      OTHR,
      poolAdmin,
      nOTHR,
    } = testEnv;

    hotWallet = await getHotWalletProxy();
    await supplyAndValidate(OTHR, "5", user1, true);

    const currentTime = await timeLatest();
    await expect(
      await nOTHR
        .connect(poolAdmin.signer)
        .setHotWallet(user1.address, currentTime.add(3600), true)
    );
  });

  it("Admin can set hot wallet from NToken", async () => {
    const {
      users: [user1],
      nOTHR,
    } = testEnv;

    await expect(await hotWallet.getHotWallet(nOTHR.address)).to.be.eq(
      user1.address
    );
  });

  it("Non-admin can't set hot wallet from NToken", async () => {
    const {
      users: [user1, user2],
      nOTHR,
    } = testEnv;

    const currentTime = await timeLatest();

    await expect(
      nOTHR
        .connect(user2.signer)
        .setHotWallet(user2.address, currentTime.add(3600), true)
    ).to.be.reverted;

    await expect(await hotWallet.getHotWallet(nOTHR.address)).to.be.eq(
      user1.address
    );
  });

  it("Delegation should expire after the set expiration time", async () => {
    const {
      users: [user1],
    } = testEnv;

    const currentTime = await timeLatest();

    await expect(
      (
        await hotWallet.getColdWalletLinks(user1.address)
      )[0].expirationTimestamp
    ).to.be.lt(currentTime.add(3700).toNumber());
  });

  it("Hot Wallet should be locked", async () => {
    const {
      users: [user1],
    } = testEnv;
    await expect(await hotWallet.isLocked(user1.address)).to.be.eq(true);
  });

  it("Hot Wallet should be able to renounce itself from delegation", async () => {
    const {
      users: [user1],
      nOTHR,
    } = testEnv;

    await expect(await hotWallet.connect(user1.signer).renounceHotWallet());

    await expect(await hotWallet.getHotWallet(nOTHR.address)).to.be.eq(
      ZERO_ADDRESS
    );
  });

  it("OTHR owner can flashclaim OTHREXP, VSL", async () => {
    const {
      users: [user1],
      nOTHR,
      pool,
      nVSL,
      nOTHREXP,
    } = testEnv;

    const nOTHRBalanceBefore = await nOTHR.balanceOf(user1.address);

    await expect(
      await pool
        .connect(user1.signer)
        .claimOtherExpandedAndSupply(["0"], [], [], [[]])
    );

    const nOTHRBalanceAfter = await nOTHR.balanceOf(user1.address);
    await expect(nOTHRBalanceAfter).to.be.eq(nOTHRBalanceBefore.sub(1));

    const nOTHREXPBalanceAfter = await nOTHREXP.balanceOf(user1.address);
    const nVSLBalanceAfter = await nVSL.balanceOf(user1.address);

    await expect(nOTHREXPBalanceAfter).to.be.eq(1);
    await expect(nVSLBalanceAfter).to.be.eq(1);
  });

  it("OTHR non-owner can't flashclaim OTHREXP, VSL, KODA", async () => {
    const {
      users: [, user2],
      pool,
    } = testEnv;

    await expect(
      pool
        .connect(user2.signer)
        .claimOtherExpandedAndSupply(["0"], [], [], [[]])
    ).to.be.reverted;
  });

  it("OTHR owner can flashclaim multiple OTHREXP, VSL", async () => {
    const {
      users: [user1],
      pool,
      nVSL,
      nOTHREXP,
    } = testEnv;

    await expect(
      await pool
        .connect(user1.signer)
        .claimOtherExpandedAndSupply(["0", "1", "2"], [], [], [[]])
    );

    const nOTHREXPBalanceAfter = await nOTHREXP.balanceOf(user1.address);
    const nVSLBalanceAfter = await nVSL.balanceOf(user1.address);

    await expect(nOTHREXPBalanceAfter).to.be.eq(3);
    await expect(nVSLBalanceAfter).to.be.eq(3);
  });

  it("OTHR owner can flashclaim OTHREXP, VSL and KODA", async () => {
    const {
      users: [user1],
      pool,
      nVSL,
      nOTHREXP,
      nKODA,
    } = testEnv;

    await expect(
      await pool.connect(user1.signer).claimOtherExpandedAndSupply(
        ["0", "1", "2"],
        ["12", "23"],
        ["1", "2"],
        [[]] //merkle proof
      )
    );

    const nOTHREXPBalanceAfter = await nOTHREXP.balanceOf(user1.address);
    const nVSLBalanceAfter = await nVSL.balanceOf(user1.address);
    const nKODAPBalanceAfter = await nKODA.balanceOf(user1.address);

    await expect(nOTHREXPBalanceAfter).to.be.eq(3);
    await expect(nVSLBalanceAfter).to.be.eq(3);
    await expect(nKODAPBalanceAfter).to.be.eq(2);
  });

  it("OTHR owner can flashclaim if HF is above 1'", async () => {
    const {
      users: [user1, user2],
      pool,
      VSL,
      OTHREXP,
      weth,
    } = testEnv;
    await supplyAndValidate(weth, "100000", user2, true);
    await borrowAndValidate(weth, "3", user1); // can borrow 30% of total value (10)

    await pool.connect(user1.signer).claimOtherExpandedAndSupply(
      ["0", "1", "2"],
      [],
      [],
      [[]] //merkle proof
    );

    await expect(
      BigNumber.from(
        (
          await pool.getUserAccountData(user1.address)
        ).healthFactor
      )
    ).to.be.gt(BigNumber.from(10).pow(18));
  });

  it("OTHR owner can't flashclaim if HF goes below 1'", async () => {
    const {
      users: [user1, user2],
      pool,
      VSL,
      OTHREXP,
      weth,
    } = testEnv;
    await supplyAndValidate(weth, "100000", user2, true);
    await borrowAndValidate(weth, "3", user1); // can borrow 30% of total value (10)

    await changePriceAndValidate(VSL, "0.000001");
    await changePriceAndValidate(OTHREXP, "0.000001");

    await expect(
      pool.connect(user1.signer).claimOtherExpandedAndSupply(
        ["0", "1", "2"],
        [],
        [],
        [[]] //merkle proof
      )
    ).to.be.revertedWith(
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    );
  });
});
