import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {MAX_UINT_AMOUNT, ONE_YEAR} from "../deploy/helpers/constants";
import {getAggregator} from "../deploy/helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {advanceTimeAndBlock, waitForTx} from "../deploy/helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

import {
  borrowAndValidate,
  changePriceAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
} from "./helpers/validated-steps";

describe("APE coin staking", () => {
  let testEnv: TestEnv;
  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      users: [user1],
      bayc,
      mayc,
    } = testEnv;

    const daiAgg = await getAggregator(undefined, "DAI");
    await daiAgg.updateLatestAnswer("908578801039414");

    await supplyAndValidate(bayc, "2", user1, true);
    await switchCollateralAndValidate(user1, bayc, false, 1);

    await supplyAndValidate(mayc, "2", user1, true);
    await switchCollateralAndValidate(user1, mayc, false, 0);
    await switchCollateralAndValidate(user1, mayc, false, 1);
  });

  it("TC-ntoken-ape-staking-01 User 1 stakes some apecoin with their BAYC", async () => {
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

    expect(
      nBAYC.connect(user1.signer).depositApeCoin([{tokenId: 0, amount: amount}])
    );
  });

  it("TC-ntoken-ape-staking-02 User 1 claims the full staked rewards (BAYC)", async () => {
    const {
      users: [user1],
      nBAYC,
      ape,
      apeCoinStaking,
    } = testEnv;

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    const pendingRewards = await apeCoinStaking.pendingRewards(
      1,
      nBAYC.address,
      "0"
    );

    // send extra tokens to the apestaking contract for rewards
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](apeCoinStaking.address, pendingRewards.mul(2))
    );

    await nBAYC.connect(user1.signer).claimApeCoin(["0"], user1.address);

    const userBalance = await ape.balanceOf(user1.address);
    expect(userBalance).to.be.eq(pendingRewards);
  });

  it("TC-ntoken-ape-staking-03 User 1 withdraws the full staked balance + rewards (BAYC)", async () => {
    const {
      users: [user1],
      nBAYC,
      ape,
      apeCoinStaking,
    } = testEnv;

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    const amount = await convertToCurrencyDecimals(ape.address, "20");
    const userBalanceBefore = await ape.balanceOf(user1.address);

    const pendingRewards = await apeCoinStaking.pendingRewards(
      1,
      nBAYC.address,
      "0"
    );

    // send extra tokens to the apestaking contract for rewards
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](apeCoinStaking.address, pendingRewards.mul(2))
    );

    expect(
      await nBAYC
        .connect(user1.signer)
        .withdrawApeCoin([{tokenId: "0", amount: amount}], user1.address)
    );

    const userBalanceAfter = await ape.balanceOf(user1.address);
    expect(userBalanceAfter).to.eq(
      userBalanceBefore.add(amount).add(pendingRewards)
    );
  });

  it("TC-ntoken-ape-staking-04 On BAYC liquidation, the staked apecoins should be withdrawn", async () => {
    const {
      users: [user1, liquidator],
      pool,
      bayc,
      nBAYC,
      weth,
      ape,
    } = testEnv;
    const amount = await convertToCurrencyDecimals(ape.address, "20");

    nBAYC.connect(user1.signer).depositApeCoin([{tokenId: 0, amount: amount}]);

    await supplyAndValidate(weth, "91", liquidator, true, "200000");

    await borrowAndValidate(weth, "13", user1);

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
      .liquidateERC721(
        bayc.address,
        user1.address,
        0,
        await convertToCurrencyDecimals(weth.address, "13"),
        false,
        {gasLimit: 5000000}
      );

    expect(await ape.balanceOf(user1.address)).to.be.gte(amount);
  });

  it("TC-ntoken-ape-staking-05 On BAYC liquidation with receive ntoken, the staked apecoins should be withdrawn", async () => {
    const {
      users: [user1, liquidator],
      pool,
      bayc,
      nBAYC,
      weth,
      ape,
    } = testEnv;
    const amount = await convertToCurrencyDecimals(ape.address, "20");
    await switchCollateralAndValidate(user1, bayc, true, 1);

    nBAYC.connect(user1.signer).depositApeCoin([{tokenId: 1, amount: amount}]);

    await changePriceAndValidate(bayc, "1111");

    await borrowAndValidate(weth, "13", user1);

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
      .liquidateERC721(
        bayc.address,
        user1.address,
        1,
        await convertToCurrencyDecimals(weth.address, "13"),
        true,
        {gasLimit: 5000000}
      );

    expect(await ape.balanceOf(user1.address)).to.be.gte(amount);
  });

  it("TC-ntoken-ape-staking-06 User 1 stakes some apecoin with their MAYC", async () => {
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

    expect(
      nMAYC.connect(user1.signer).depositApeCoin([{tokenId: 0, amount: amount}])
    );
  });

  it("TC-ntoken-ape-staking-07 User 1 claim the full staked rewards (MAYC)", async () => {
    const {
      users: [user1],
      nMAYC,
      ape,
      apeCoinStaking,
    } = testEnv;

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    const userBalanceBefore = await ape.balanceOf(user1.address);

    const pendingRewards = await apeCoinStaking.pendingRewards(
      2,
      nMAYC.address,
      "0"
    );

    // send extra tokens to the apestaking contract for rewards
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](apeCoinStaking.address, pendingRewards.mul(2))
    );

    await nMAYC.connect(user1.signer).claimApeCoin(["0"], user1.address);

    const userBalance = await ape.balanceOf(user1.address);
    expect(userBalance).to.be.eq(userBalanceBefore.add(pendingRewards));
  });

  it("TC-ntoken-ape-staking-08 User 1 withdraw the full staked balance + rewards (MAYC)", async () => {
    const {
      users: [user1],
      nMAYC,
      ape,
      apeCoinStaking,
    } = testEnv;

    // Advance time and blocks
    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    const amount = await convertToCurrencyDecimals(ape.address, "20");
    const userBalanceBefore = await ape.balanceOf(user1.address);

    const pendingRewards = await apeCoinStaking.pendingRewards(
      2,
      nMAYC.address,
      "0"
    );

    // send extra tokens to the apestaking contract for rewards
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](apeCoinStaking.address, pendingRewards.mul(2))
    );

    expect(
      await nMAYC
        .connect(user1.signer)
        .withdrawApeCoin([{tokenId: "0", amount: amount}], user1.address)
    );

    const userBalanceAfter = await ape.balanceOf(user1.address);
    expect(userBalanceAfter).to.eq(
      userBalanceBefore.add(amount).add(pendingRewards)
    );
  });

  it("TC-ntoken-ape-staking-09 On MAYC liquidation, the staked apecoins should be withdrawn", async () => {
    const {
      users: [user1, liquidator],
      pool,
      mayc,
      nMAYC,
      weth,
      ape,
    } = testEnv;

    const amount = await convertToCurrencyDecimals(ape.address, "20");

    nMAYC.connect(user1.signer).depositApeCoin([{tokenId: 0, amount: amount}]);

    await switchCollateralAndValidate(user1, mayc, true, 0);

    await changePriceAndValidate(mayc, "100");

    await borrowAndValidate(weth, "13", user1);

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
      .liquidateERC721(
        mayc.address,
        user1.address,
        0,
        await convertToCurrencyDecimals(weth.address, "13"),
        false,
        {gasLimit: 5000000}
      );

    expect(await ape.balanceOf(user1.address)).to.be.gte(amount);
  });

  it("TC-ntoken-ape-staking-10 On MAYC liquidation with receive ntoken, the staked apecoins should be withdrawn ", async () => {
    const {
      users: [user1, liquidator],
      pool,
      mayc,
      nMAYC,
      weth,
      ape,
    } = testEnv;

    const amount = await convertToCurrencyDecimals(ape.address, "20");

    nMAYC.connect(user1.signer).depositApeCoin([{tokenId: 1, amount: amount}]);

    await switchCollateralAndValidate(user1, mayc, true, 1);

    await changePriceAndValidate(mayc, "200");

    await borrowAndValidate(weth, "13", user1);

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
      .liquidateERC721(
        mayc.address,
        user1.address,
        1,
        await convertToCurrencyDecimals(weth.address, "13"),
        true,
        {gasLimit: 5000000}
      );

    expect(await ape.balanceOf(user1.address)).to.be.gte(amount);
  });
});
