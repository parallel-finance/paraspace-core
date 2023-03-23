import {expect} from "chai";
import {timeLatest} from "../helpers/misc-utils";

import {TestEnv} from "./helpers/make-suite";

import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";

import {HotWalletProxy} from "../types";
import {deployHotWalletProxy} from "../helpers/contracts-deployments";
import {getHotWalletProxy} from "../helpers/contracts-getters";

describe("Otherdeed nToken warmwallet delegation", () => {
  let testEnv: TestEnv;
  let hotWallet: HotWalletProxy;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {deployer} = testEnv;

    hotWallet = await getHotWalletProxy();
  });

  it("Admin can set hot wallet from NToken", async () => {
    const {
      users: [user1, user2],
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
      poolAdmin,
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
});
