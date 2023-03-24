import {expect} from "chai";
import {timeLatest} from "../helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {HotWalletProxy} from "../types";
import {getHotWalletProxy} from "../helpers/contracts-getters";
import {ZERO_ADDRESS} from "../helpers/constants";

describe("Otherdeed nToken warmwallet delegation", () => {
  let testEnv: TestEnv;
  let hotWallet: HotWalletProxy;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    hotWallet = await getHotWalletProxy();
  });

  it("Admin can set hot wallet from NToken", async () => {
    const {
      users: [user1],
      nOTHR,
      poolAdmin,
    } = testEnv;

    const currentTime = await timeLatest();

    await expect(
      await nOTHR
        .connect(poolAdmin.signer)
        .setHotWallet(user1.address, currentTime.add(3600), true)
    );

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
});
