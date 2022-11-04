import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {getMockAggregator} from "../deploy/helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

import {
  borrowAndValidate,
  changePriceAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
} from "./helpers/validated-steps";

describe("ape coin staking", () => {
  let testEnv: TestEnv;
  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      users: [user1],
      bayc,
      mayc,
      ape,
      apeCoinStaking,
    } = testEnv;

    const daiAgg = await getMockAggregator(undefined, "DAI");
    await daiAgg.updateLatestAnswer("908578801039414");

    // send extra tokens to the apestaking contract for rewards
    const amount = await convertToCurrencyDecimals(ape.address, "2000000");
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](apeCoinStaking.address, amount)
    );

    await supplyAndValidate(bayc, "2", user1, true);
    await switchCollateralAndValidate(user1, bayc, false, 1);

    await supplyAndValidate(mayc, "2", user1, true);
    await switchCollateralAndValidate(user1, mayc, false, 0);
    await switchCollateralAndValidate(user1, mayc, false, 1);
  });

  it("User 1 stakes some apecoing with their BAYC", async () => {
    const {
      users: [user1],
      nBAYC,
      ape,
    } = testEnv;

    const amount = await convertToCurrencyDecimals(ape.address, "20");

    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](user1.address, amount)
    );

    await waitForTx(
      await ape.connect(user1.signer).approve(nBAYC.address, MAX_UINT_AMOUNT)
    );

    nBAYC.connect(user1.signer).depositApeCoin([{tokenId: 0, amount: amount}]);
  });

  it("User 1 claim the full staked rewards", async () => {
    const {
      users: [user1],
      nBAYC,
      ape,
      apeCoinStaking,
    } = testEnv;

    const pendingRewards = await apeCoinStaking.pendingRewards(
      1,
      nBAYC.address,
      "0"
    );

    await nBAYC.connect(user1.signer).claimApeCoin(["0"], user1.address);

    const userBalance = await ape.balanceOf(user1.address);

    expect(pendingRewards).to.be.eq(userBalance);
  });

  it("User 1 withdraw the full staked balance + rewards", async () => {
    const {
      users: [user1],
      nBAYC,
      ape,
    } = testEnv;

    const amount = await convertToCurrencyDecimals(ape.address, "20");

    await nBAYC
      .connect(user1.signer)
      .withdrawApeCoin([{tokenId: "0", amount: amount}], user1.address);
  });

  it("on BAYC liquidation, the staked apecoins should be withdrawn", async () => {
    const {
      users: [user1, liquidator],
      pool,
      bayc,
      nBAYC,
      dai,
      ape,
    } = testEnv;
    const amount = await convertToCurrencyDecimals(ape.address, "20");

    nBAYC.connect(user1.signer).depositApeCoin([{tokenId: 0, amount: amount}]);

    await supplyAndValidate(dai, "100000", liquidator, true, "200000");

    await borrowAndValidate(dai, "15000", user1);

    // drop BAYC price to liquidation levels
    await changePriceAndValidate(bayc, "3");

    // start auction
    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .startAuction(user1.address, bayc.address, 0)
    );

    // try to liquidate the NFT
    await pool
      .connect(liquidator.signer)
      .liquidationERC721(
        bayc.address,
        dai.address,
        user1.address,
        0,
        await convertToCurrencyDecimals(dai.address, "15000"),
        false
      );

    expect(await ape.balanceOf(user1.address)).to.be.gte(amount);
  });

  it("on BAYC liquidation with receive ntoken, the staked apecoins should be withdrawn ", async () => {
    const {
      users: [user1, liquidator],
      pool,
      bayc,
      nBAYC,
      dai,
      ape,
    } = testEnv;
    const amount = await convertToCurrencyDecimals(ape.address, "20");
    await switchCollateralAndValidate(user1, bayc, true, 1);

    nBAYC.connect(user1.signer).depositApeCoin([{tokenId: 1, amount: amount}]);

    await changePriceAndValidate(bayc, "1111");

    await borrowAndValidate(dai, "15000", user1);

    // drop BAYC price to liquidation levels
    await changePriceAndValidate(bayc, "3");

    // start auction
    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .startAuction(user1.address, bayc.address, 1)
    );

    // try to liquidate the NFT
    await pool
      .connect(liquidator.signer)
      .liquidationERC721(
        bayc.address,
        dai.address,
        user1.address,
        1,
        await convertToCurrencyDecimals(dai.address, "15000"),
        true
      );

    expect(await ape.balanceOf(user1.address)).to.be.gte(amount);
  });

  it("User 1 stakes some apecoing with their MAYC", async () => {
    const {
      users: [user1],
      mayc,
      nMAYC,
      ape,
    } = testEnv;

    await switchCollateralAndValidate(user1, mayc, false, 0);

    const amount = await convertToCurrencyDecimals(ape.address, "20");

    await waitForTx(
      await ape.connect(user1.signer).approve(nMAYC.address, MAX_UINT_AMOUNT)
    );

    nMAYC.connect(user1.signer).depositApeCoin([{tokenId: 0, amount: amount}]);
  });

  it("User 1 claim the full staked MAYC rewards", async () => {
    const {
      users: [user1],
      nMAYC,
      ape,
      apeCoinStaking,
    } = testEnv;

    const pendingRewards = await apeCoinStaking.pendingRewards(
      2,
      nMAYC.address,
      "0"
    );

    await nMAYC.connect(user1.signer).claimApeCoin(["0"], user1.address);

    const userBalance = await ape.balanceOf(user1.address);

    expect(pendingRewards).to.be.eq(userBalance);
  });

  it("User 1 withdraw the full staked balance + rewards", async () => {
    const {
      users: [user1],
      nMAYC,
      ape,
    } = testEnv;

    const amount = await convertToCurrencyDecimals(ape.address, "20");

    await nMAYC
      .connect(user1.signer)
      .withdrawApeCoin([{tokenId: "0", amount: amount}], user1.address);
  });

  it("on MAYC liquidation, the staked apecoins should be withdrawn", async () => {
    const {
      users: [user1, liquidator],
      pool,
      mayc,
      nMAYC,
      dai,
      ape,
    } = testEnv;

    const amount = await convertToCurrencyDecimals(ape.address, "20");

    nMAYC.connect(user1.signer).depositApeCoin([{tokenId: 0, amount: amount}]);

    await switchCollateralAndValidate(user1, mayc, true, 0);

    await changePriceAndValidate(mayc, "100");

    await borrowAndValidate(dai, "15000", user1);

    // drop MAYC price to liquidation levels
    await changePriceAndValidate(mayc, "3");

    // start auction
    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .startAuction(user1.address, mayc.address, 0)
    );

    // try t1o liquidate the NFT
    await pool
      .connect(liquidator.signer)
      .liquidationERC721(
        mayc.address,
        dai.address,
        user1.address,
        0,
        await convertToCurrencyDecimals(dai.address, "15000"),
        false
      );

    expect(await ape.balanceOf(user1.address)).to.be.gte(amount);
  });

  it("on MAYC liquidation with receive ntoken, the staked apecoins should be withdrawn ", async () => {
    const {
      users: [user1, liquidator],
      pool,
      mayc,
      nMAYC,
      dai,
      ape,
    } = testEnv;

    const amount = await convertToCurrencyDecimals(ape.address, "20");

    nMAYC.connect(user1.signer).depositApeCoin([{tokenId: 1, amount: amount}]);

    await switchCollateralAndValidate(user1, mayc, true, 1);

    await changePriceAndValidate(mayc, "100");

    await borrowAndValidate(dai, "15000", user1);

    // drop MAYC price to liquidation levels
    await changePriceAndValidate(mayc, "3");

    // start auction
    await waitForTx(
      await pool
        .connect(liquidator.signer)
        .startAuction(user1.address, mayc.address, 1)
    );

    // try to liquidate the NFT
    await pool
      .connect(liquidator.signer)
      .liquidationERC721(
        mayc.address,
        dai.address,
        user1.address,
        1,
        await convertToCurrencyDecimals(dai.address, "15000"),
        true
      );

    expect(await ape.balanceOf(user1.address)).to.be.gte(amount);
  });
});
