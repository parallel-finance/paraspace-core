import {expect} from "chai";
import {timeLatest, waitForTx} from "../helpers/misc-utils";
import {MAX_UINT_AMOUNT, ZERO_ADDRESS} from "../helpers/constants";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {TestEnv} from "./helpers/make-suite";
import {getAggregator, getMoonBirds} from "../helpers/contracts-getters";
import {parseEther} from "ethers/lib/utils";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {executeSeaportBuyWithCredit} from "./helpers/marketplace-helper";
import {supplyAndValidate} from "./helpers/validated-steps";
import {HotWalletProxy} from "../types";
import {deployHotWalletProxy} from "../helpers/contracts-deployments";

describe("Otherdeed nToken warmwallet delegation", () => {
  let testEnv: TestEnv;
  let hotWallet: HotWalletProxy;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {deployer} = testEnv;

    hotWallet = await deployHotWalletProxy();
    await hotWallet.initialize(deployer.address, deployer.address);
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

    await expect(hotWallet.getHotWallet(nOTHR.address)).to.be.eq(user1.address);
  });

  it("Admin can't set hot wallet from NToken", async () => {
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
    ).to.be.reverted();
    await expect(hotWallet.getHotWallet(nOTHR.address)).to.be.eq(user1.address);
  });
});
