import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {AutoCompoundApe, P2PPairStaking, PToken, PTokenSApe} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate, supplyAndValidate} from "./helpers/validated-steps";
import {
  getAutoCompoundApe,
  getP2PPairStaking,
  getPToken,
  getPTokenSApe,
} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT, ONE_ADDRESS} from "../helpers/constants";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {getSignedListingOrder} from "./helpers/p2ppairstaking-helper";
import {parseEther} from "ethers/lib/utils";
import {almostEqual} from "./helpers/uniswapv3-helper";

describe("P2P Pair Staking Test", () => {
  let testEnv: TestEnv;
  let p2pPairStaking: P2PPairStaking;
  let cApe: AutoCompoundApe;
  let pCApe: PToken;
  let MINIMUM_LIQUIDITY;
  const sApeAddress = ONE_ADDRESS;
  let pSApeCoin: PTokenSApe;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      users,
      apeCoinStaking,
      bayc,
      mayc,
      bakc,
      nBAYC,
      nMAYC,
      nBAKC,
      poolAdmin,
      protocolDataProvider,
      pool,
    } = testEnv;

    const user1 = users[0];
    const user2 = users[1];
    const user4 = users[5];

    p2pPairStaking = await getP2PPairStaking();
    const {xTokenAddress: pSApeCoinAddress} =
      await protocolDataProvider.getReserveTokensAddresses(sApeAddress);
    pSApeCoin = await getPTokenSApe(pSApeCoinAddress);

    cApe = await getAutoCompoundApe();
    MINIMUM_LIQUIDITY = await cApe.MINIMUM_LIQUIDITY();

    const {xTokenAddress: pCApeAddress} =
      await protocolDataProvider.getReserveTokensAddresses(cApe.address);
    pCApe = await getPToken(pCApeAddress);

    // approve nBAYC, nMAYC and nBAKC to P2P
    await waitForTx(
      await nBAYC
        .connect(poolAdmin.signer)
        .setApprovalForAllTo(bayc.address, p2pPairStaking.address)
    );
    await waitForTx(
      await nMAYC
        .connect(poolAdmin.signer)
        .setApprovalForAllTo(mayc.address, p2pPairStaking.address)
    );
    await waitForTx(
      await nBAKC
        .connect(poolAdmin.signer)
        .setApprovalForAllTo(bakc.address, p2pPairStaking.address)
    );

    // send extra tokens to the apestaking contract for rewards
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](
          apeCoinStaking.address,
          parseEther("100000000000")
        )
    );

    // user4 deposit MINIMUM_LIQUIDITY to make test case easy
    await mintAndValidate(ape, "1", user4);
    await waitForTx(
      await ape.connect(user4.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe.connect(user4.signer).deposit(user4.address, MINIMUM_LIQUIDITY)
    );

    await waitForTx(
      await ape.connect(user2.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await pCApe
        .connect(user2.signer)
        .approve(p2pPairStaking.address, MAX_UINT_AMOUNT)
    );

    return testEnv;
  };

  it("test BAYC pair with ApeCoin Staking", async () => {
    const {
      users: [user1, user2],
      ape,
      bayc,
      nBAYC,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await mintAndValidate(ape, "1000000", user2);

    const apeAmount = await p2pPairStaking.getApeCoinStakingCap(0);

    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(cApe.address, apeAmount, user2.address, 0)
    );

    const user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      bayc,
      0,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      pCApe,
      0,
      8000,
      user2
    );

    const txReceipt = await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    );
    const logLength = txReceipt.logs.length;
    const orderHash = txReceipt.logs[logLength - 1].data;

    expect(await pSApeCoin.balanceOf(user1.address)).to.be.equal(0);

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .claimForMatchedOrderAndCompound([orderHash])
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("2880")
    );

    await waitForTx(
      await p2pPairStaking.connect(user1.signer).claimCApeReward(user1.address)
    );
    await waitForTx(
      await p2pPairStaking.connect(user2.signer).claimCApeReward(user2.address)
    );

    almostEqual(await cApe.balanceOf(user1.address), parseEther("720"));
    almostEqual(await cApe.balanceOf(user2.address), parseEther("2880"));

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await p2pPairStaking.connect(user1.signer).breakUpMatchedOrder(orderHash)
    );

    expect(await bayc.balanceOf(nBAYC.address)).to.be.equal(1);
    almostEqual(await pCApe.balanceOf(user2.address), apeAmount);
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("2880")
    );
  });

  it("test MAYC pair with ApeCoin Staking", async () => {
    const {
      users: [user1, user2],
      ape,
      mayc,
      nMAYC,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(mayc, "1", user1, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await mayc
        .connect(user1.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );

    const apeAmount = await p2pPairStaking.getApeCoinStakingCap(1);

    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(cApe.address, apeAmount, user2.address, 0)
    );

    const user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      1,
      mayc,
      0,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      1,
      pCApe,
      0,
      8000,
      user2
    );

    const txReceipt = await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    );
    const logLength = txReceipt.logs.length;
    const orderHash = txReceipt.logs[logLength - 1].data;

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .claimForMatchedOrderAndCompound([orderHash])
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("2880")
    );

    await waitForTx(
      await p2pPairStaking.connect(user1.signer).claimCApeReward(user1.address)
    );
    await waitForTx(
      await p2pPairStaking.connect(user2.signer).claimCApeReward(user2.address)
    );

    almostEqual(await cApe.balanceOf(user1.address), parseEther("720"));
    almostEqual(await cApe.balanceOf(user2.address), parseEther("2880"));

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await p2pPairStaking.connect(user1.signer).breakUpMatchedOrder(orderHash)
    );

    expect(await mayc.balanceOf(nMAYC.address)).to.be.equal(1);
    almostEqual(await pCApe.balanceOf(user2.address), apeAmount);
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("2880")
    );
  });

  it("test BAYC pair with BAKC and ApeCoin Staking", async () => {
    const {
      users: [user1, user2, user3],
      ape,
      bayc,
      bakc,
      nBAYC,
      nBAKC,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user3, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user3.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );

    const apeAmount = await p2pPairStaking.getApeCoinStakingCap(2);

    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(cApe.address, apeAmount, user2.address, 0)
    );

    const user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      bayc,
      0,
      2000,
      user1
    );
    const user3SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      bakc,
      0,
      2000,
      user3
    );
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      pCApe,
      0,
      6000,
      user2
    );

    const txReceipt = await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .matchBAKCPairStakingList(
          user1SignedOrder,
          user3SignedOrder,
          user2SignedOrder
        )
    );

    const logLength = txReceipt.logs.length;
    const orderHash = txReceipt.logs[logLength - 1].data;

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .claimForMatchedOrderAndCompound([orderHash])
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user3.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("2160")
    );

    await waitForTx(
      await p2pPairStaking.connect(user1.signer).claimCApeReward(user1.address)
    );
    await waitForTx(
      await p2pPairStaking.connect(user2.signer).claimCApeReward(user2.address)
    );
    await waitForTx(
      await p2pPairStaking.connect(user3.signer).claimCApeReward(user3.address)
    );

    almostEqual(await cApe.balanceOf(user1.address), parseEther("720"));
    almostEqual(await cApe.balanceOf(user3.address), parseEther("720"));
    almostEqual(await cApe.balanceOf(user2.address), parseEther("2160"));

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await p2pPairStaking.connect(user1.signer).breakUpMatchedOrder(orderHash)
    );

    expect(await bayc.balanceOf(nBAYC.address)).to.be.equal(1);
    expect(await bakc.balanceOf(nBAKC.address)).to.be.equal(1);
    almostEqual(await pCApe.balanceOf(user2.address), apeAmount);

    almostEqual(
      await p2pPairStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user3.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("2160")
    );
  });

  it("test MAYC pair with BAKC and ApeCoin Staking", async () => {
    const {
      users: [user1, user2, user3],
      ape,
      mayc,
      bakc,
      nMAYC,
      nBAKC,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(mayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user3, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await mayc
        .connect(user1.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user3.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    const apeAmount = await p2pPairStaking.getApeCoinStakingCap(3);

    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(cApe.address, apeAmount, user2.address, 0)
    );

    const user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      3,
      mayc,
      0,
      2000,
      user1
    );
    const user3SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      3,
      bakc,
      0,
      2000,
      user3
    );
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      3,
      pCApe,
      0,
      6000,
      user2
    );

    const txReceipt = await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .matchBAKCPairStakingList(
          user1SignedOrder,
          user3SignedOrder,
          user2SignedOrder
        )
    );

    const logLength = txReceipt.logs.length;
    const orderHash = txReceipt.logs[logLength - 1].data;

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .claimForMatchedOrderAndCompound([orderHash])
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user3.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("2160")
    );

    await waitForTx(
      await p2pPairStaking.connect(user1.signer).claimCApeReward(user1.address)
    );
    await waitForTx(
      await p2pPairStaking.connect(user2.signer).claimCApeReward(user2.address)
    );
    await waitForTx(
      await p2pPairStaking.connect(user3.signer).claimCApeReward(user3.address)
    );

    almostEqual(await cApe.balanceOf(user1.address), parseEther("720"));
    almostEqual(await cApe.balanceOf(user3.address), parseEther("720"));
    almostEqual(await cApe.balanceOf(user2.address), parseEther("2160"));

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await p2pPairStaking.connect(user1.signer).breakUpMatchedOrder(orderHash)
    );

    expect(await mayc.balanceOf(nMAYC.address)).to.be.equal(1);
    expect(await bakc.balanceOf(nBAKC.address)).to.be.equal(1);
    almostEqual(await pCApe.balanceOf(user2.address), apeAmount);
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user3.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("2160")
    );
  });

  it("claimForMatchedOrderAndCompound for multi user work as expected", async () => {
    const {
      users: [user1, user2, user3],
      ape,
      bayc,
      bakc,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "10", user1, true);
    await supplyAndValidate(bakc, "10", user3, true);
    await mintAndValidate(ape, "10000000", user2);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user3.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    await waitForTx(
      await cApe
        .connect(user2.signer)
        .deposit(user2.address, parseEther("1000000"))
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(cApe.address, parseEther("1000000"), user2.address, 0)
    );

    const txArray: string[] = [];
    for (let i = 0; i < 10; i++) {
      const user1SignedOrder = await getSignedListingOrder(
        p2pPairStaking,
        2,
        bayc,
        i,
        2000,
        user1
      );
      const user3SignedOrder = await getSignedListingOrder(
        p2pPairStaking,
        2,
        bakc,
        i,
        2000,
        user3
      );
      const user2SignedOrder = await getSignedListingOrder(
        p2pPairStaking,
        2,
        pCApe,
        0,
        6000,
        user2
      );

      const txReceipt = await waitForTx(
        await p2pPairStaking
          .connect(user1.signer)
          .matchBAKCPairStakingList(
            user1SignedOrder,
            user3SignedOrder,
            user2SignedOrder
          )
      );
      const logLength = txReceipt.logs.length;
      const orderHash = txReceipt.logs[logLength - 1].data;

      txArray.push(orderHash);
    }

    for (let i = 0; i < 2; i++) {
      await advanceTimeAndBlock(parseInt("3600"));

      await waitForTx(
        await p2pPairStaking
          .connect(user1.signer)
          .claimForMatchedOrderAndCompound(txArray)
      );
    }
  });

  it("match failed when order was canceled 0", async () => {
    const {
      users: [user1, user2],
      ape,
      bayc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    await waitForTx(
      await ape
        .connect(user2.signer)
        .approve(p2pPairStaking.address, MAX_UINT_AMOUNT)
    );

    const user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      bayc,
      0,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      ape,
      0,
      8000,
      user2
    );

    await waitForTx(
      await p2pPairStaking.connect(user2.signer).cancelListing(user2SignedOrder)
    );

    await expect(
      p2pPairStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    ).to.be.revertedWith("order already canceled");
  });

  it("match failed when order was canceled 1", async () => {
    const {
      users: [user1, user2, user3],
      ape,
      bayc,
      bakc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user2, true);
    await mintAndValidate(ape, "1000000", user3);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user2.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    await waitForTx(
      await ape
        .connect(user3.signer)
        .approve(p2pPairStaking.address, MAX_UINT_AMOUNT)
    );

    const user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      bayc,
      0,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      bakc,
      0,
      2000,
      user2
    );
    const user3SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      ape,
      0,
      6000,
      user3
    );

    await waitForTx(
      await p2pPairStaking.connect(user3.signer).cancelListing(user3SignedOrder)
    );

    await expect(
      p2pPairStaking
        .connect(user1.signer)
        .matchBAKCPairStakingList(
          user1SignedOrder,
          user2SignedOrder,
          user3SignedOrder
        )
    ).to.be.revertedWith("order already canceled");
  });

  it("match failed when orders type match failed 0", async () => {
    const {
      users: [user1, user2],
      ape,
      bayc,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    const apeAmount = await p2pPairStaking.getApeCoinStakingCap(0);

    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(cApe.address, apeAmount, user2.address, 0)
    );

    const user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      bayc,
      0,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      1,
      pCApe,
      0,
      8000,
      user2
    );

    await expect(
      p2pPairStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    ).to.be.revertedWith("orders type match failed");
  });

  it("match failed when orders type match failed 1", async () => {
    const {
      users: [user1, user2, user3],
      ape,
      bayc,
      bakc,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user3, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user3.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );

    const apeAmount = await p2pPairStaking.getApeCoinStakingCap(2);

    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(cApe.address, apeAmount, user2.address, 0)
    );

    const user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      bayc,
      0,
      2000,
      user1
    );
    const user3SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      1,
      bakc,
      0,
      2000,
      user3
    );
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      pCApe,
      0,
      6000,
      user2
    );

    await expect(
      p2pPairStaking
        .connect(user1.signer)
        .matchBAKCPairStakingList(
          user1SignedOrder,
          user3SignedOrder,
          user2SignedOrder
        )
    ).to.be.revertedWith("orders type match failed");
  });

  it("match failed when share match failed 0", async () => {
    const {
      users: [user1, user2],
      ape,
      bayc,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    const apeAmount = await p2pPairStaking.getApeCoinStakingCap(0);

    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(cApe.address, apeAmount, user2.address, 0)
    );

    const user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      bayc,
      0,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      pCApe,
      0,
      7000,
      user2
    );

    await expect(
      p2pPairStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    ).to.be.revertedWith("share match failed");
  });

  it("match failed when share match failed 1", async () => {
    const {
      users: [user1, user2, user3],
      ape,
      bayc,
      bakc,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user3, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user3.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );

    const apeAmount = await p2pPairStaking.getApeCoinStakingCap(2);

    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(cApe.address, apeAmount, user2.address, 0)
    );

    const user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      bayc,
      0,
      2000,
      user1
    );
    const user3SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      bakc,
      0,
      2000,
      user3
    );
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      pCApe,
      0,
      7000,
      user2
    );

    await expect(
      p2pPairStaking
        .connect(user1.signer)
        .matchBAKCPairStakingList(
          user1SignedOrder,
          user3SignedOrder,
          user2SignedOrder
        )
    ).to.be.revertedWith("share match failed");
  });

  it("listing order can only be canceled by offerer", async () => {
    const {
      users: [user1, user2],
      bayc,
    } = await loadFixture(fixture);

    const user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      bayc,
      0,
      2000,
      user1
    );

    await expect(
      p2pPairStaking.connect(user2.signer).cancelListing(user1SignedOrder)
    ).to.be.revertedWith("not order offerer");

    await waitForTx(
      await p2pPairStaking.connect(user1.signer).cancelListing(user1SignedOrder)
    );
  });

  it("matching operator work as expected", async () => {
    const {
      users: [user1, user2, user3, , user5],
      gatewayAdmin,
      bayc,
      nBAYC,
      ape,
      pool,
    } = await loadFixture(fixture);

    await expect(
      p2pPairStaking.connect(user2.signer).setMatchingOperator(user5.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await waitForTx(
      await p2pPairStaking
        .connect(gatewayAdmin.signer)
        .setMatchingOperator(user5.address)
    );

    await supplyAndValidate(bayc, "1", user3, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await bayc
        .connect(user3.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    const apeAmount = await p2pPairStaking.getApeCoinStakingCap(0);

    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(cApe.address, apeAmount, user2.address, 0)
    );

    const user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      bayc,
      0,
      2000,
      user3
    );
    user1SignedOrder.v = 0;
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      pCApe,
      0,
      8000,
      user2
    );
    user2SignedOrder.v = 0;

    await expect(
      p2pPairStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    ).to.be.reverted;

    const txReceipt = await waitForTx(
      await p2pPairStaking
        .connect(user5.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    );
    const logLength = txReceipt.logs.length;
    const orderHash = txReceipt.logs[logLength - 1].data;

    await expect(
      p2pPairStaking.connect(user1.signer).breakUpMatchedOrder(orderHash)
    ).to.be.revertedWith("no permission to break up");

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await p2pPairStaking.connect(user5.signer).breakUpMatchedOrder(orderHash)
    );

    expect(await bayc.balanceOf(nBAYC.address)).to.be.equal(1);
    almostEqual(await pCApe.balanceOf(user2.address), apeAmount);
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user3.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("2880")
    );
  });

  it("compound fee work as expected", async () => {
    const {
      users: [user1, user2, user3],
      gatewayAdmin,
      bayc,
      ape,
      pool,
    } = await loadFixture(fixture);

    await waitForTx(
      await p2pPairStaking.connect(gatewayAdmin.signer).setCompoundFee(50)
    );

    await supplyAndValidate(bayc, "1", user3, true);
    await mintAndValidate(ape, "1000000", user2);

    //deposit cApe for user3 to let exchangeRate > 1
    await waitForTx(
      await ape.connect(user2.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe
        .connect(user2.signer)
        .deposit(user2.address, parseEther("1000"))
    );

    await waitForTx(
      await bayc
        .connect(user3.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    const apeAmount = await p2pPairStaking.getApeCoinStakingCap(0);

    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(cApe.address, apeAmount, user2.address, 0)
    );

    const user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      bayc,
      0,
      2000,
      user3
    );
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      pCApe,
      0,
      8000,
      user2
    );

    const txReceipt = await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    );
    const logLength = txReceipt.logs.length;
    const orderHash = txReceipt.logs[logLength - 1].data;

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .claimForMatchedOrderAndCompound([orderHash])
    );

    almostEqual(
      await p2pPairStaking.pendingCApeReward(p2pPairStaking.address),
      parseEther("18")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user3.address),
      parseEther("716.4")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("2865.6")
    );

    await waitForTx(
      await p2pPairStaking
        .connect(gatewayAdmin.signer)
        .claimCompoundFee(gatewayAdmin.address)
    );

    almostEqual(await cApe.balanceOf(gatewayAdmin.address), parseEther("18"));
  });

  it("check ape token can be matched twice", async () => {
    const {
      users: [user1, user2, user3],
      bayc,
      ape,
      bakc,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user3, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user3.signer)
        .setApprovalForAll(p2pPairStaking.address, true)
    );
    await waitForTx(
      await cApe
        .connect(user2.signer)
        .deposit(user2.address, parseEther("500000"))
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(cApe.address, parseEther("500000"), user2.address, 0)
    );

    //match bayc + ApeCoin
    let user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      bayc,
      0,
      2000,
      user1
    );
    let user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      pCApe,
      0,
      8000,
      user2
    );

    let txReceipt = await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    );
    let logLength = txReceipt.logs.length;
    const orderHash0 = txReceipt.logs[logLength - 1].data;

    //match bayc + bakc + ApeCoin
    user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      bayc,
      0,
      2000,
      user1
    );
    const user3SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      bakc,
      0,
      2000,
      user3
    );
    user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      pCApe,
      0,
      6000,
      user2
    );

    txReceipt = await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .matchBAKCPairStakingList(
          user1SignedOrder,
          user3SignedOrder,
          user2SignedOrder
        )
    );
    logLength = txReceipt.logs.length;
    const orderHash1 = txReceipt.logs[logLength - 1].data;

    await waitForTx(
      await p2pPairStaking.connect(user1.signer).breakUpMatchedOrder(orderHash0)
    );

    await waitForTx(
      await p2pPairStaking.connect(user1.signer).breakUpMatchedOrder(orderHash1)
    );
  });
});
