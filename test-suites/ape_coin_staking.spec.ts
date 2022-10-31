import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {
  getPoolProxy,
  getProtocolDataProvider,
} from "../deploy/helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

import {
  borrowAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
  withdrawAndValidate,
} from "./helpers/validated-steps";

describe("ape coin staking", () => {
  let testEnv: TestEnv;
  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
  });

  it("User 1 deposits BAYC and stakes some apecoing with their BAYC", async () => {
    const {
      users: [user1],
      bayc,
      nBAYC,
      ape,
    } = testEnv;

    await supplyAndValidate(bayc, "1", user1, true);

    const amount = await convertToCurrencyDecimals(ape.address, "20");

    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](user1.address, amount)
    );

    await waitForTx(
      await ape.connect(user1.signer).approve(nBAYC.address, MAX_UINT_AMOUNT)
    );

    nBAYC.connect(user1.signer).depositBAYC([{tokenId: 0, amount: amount}]);
  });

  it("User 1 claim the full staked rewards", async () => {
    const {
      users: [user1],
      bayc,
      nBAYC,
      ape,
      apeCoinStaking,
    } = testEnv;

    const amount = await convertToCurrencyDecimals(ape.address, "20");

    const pendingRewards = await apeCoinStaking.pendingRewards(
      1,
      nBAYC.address,
      "0"
    );

    await nBAYC.connect(user1.signer).claimBAYC(["0"], user1.address);

    const userBalance = await ape.balanceOf(user1.address);

    expect(pendingRewards).to.be.eq(userBalance);
  });

  it("User 1 withdraw the full staked balance + rewards", async () => {
    const {
      users: [user1],
      bayc,
      nBAYC,
      ape,
      apeCoinStaking,
    } = testEnv;

    const amount = await convertToCurrencyDecimals(ape.address, "20");

    const pendingRewards = await apeCoinStaking.pendingRewards(
      1,
      nBAYC.address,
      "0"
    );

    await nBAYC
      .connect(user1.signer)
      .withdrawBAYC(
        [{tokenId: "0", amount: amount.add(pendingRewards)}],
        user1.address
      );
  });

  it("User 1 deposits MAYC and stakes some apecoing with their BAYC", async () => {
    const {
      users: [user1],
      mayc,
      nMAYC,
      ape,
    } = testEnv;

    await supplyAndValidate(mayc, "1", user1, true);

    const amount = await convertToCurrencyDecimals(ape.address, "20");

    // await waitForTx(
    //     await ape
    //       .connect(user1.signer)
    //       ["mint(address,uint256)"](user1.address, amount)
    //   );

    await waitForTx(
      await ape.connect(user1.signer).approve(nMAYC.address, MAX_UINT_AMOUNT)
    );

    nMAYC.connect(user1.signer).depositMAYC([{tokenId: 0, amount: amount}]);
  });

  it("User 1 claim the full staked MAYC rewards", async () => {
    const {
      users: [user1],
      mayc,
      nMAYC,
      ape,
      apeCoinStaking,
    } = testEnv;

    const amount = await convertToCurrencyDecimals(ape.address, "20");

    const pendingRewards = await apeCoinStaking.pendingRewards(
      2,
      nMAYC.address,
      "0"
    );

    await nMAYC.connect(user1.signer).claimMAYC(["0"], user1.address);

    const userBalance = await ape.balanceOf(user1.address);

    expect(pendingRewards).to.be.eq(userBalance);
  });

  it("User 1 withdraw the full staked balance + rewards", async () => {
    const {
      users: [user1],
      mayc,
      nMAYC,
      ape,
      apeCoinStaking,
    } = testEnv;

    const amount = await convertToCurrencyDecimals(ape.address, "20");

    const pendingRewards = await apeCoinStaking.pendingRewards(
      2,
      nMAYC.address,
      "0"
    );

    await nMAYC
      .connect(user1.signer)
      .withdrawMAYC(
        [{tokenId: "0", amount: amount.add(pendingRewards)}],
        user1.address
      );
  });
});
