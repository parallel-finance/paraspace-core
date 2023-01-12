import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {AutoCompoundApe, P2PPairStaking} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate} from "./helpers/validated-steps";
import {
  getAutoCompoundApe,
  getP2PPairStaking,
} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {getSignedListingOrder} from "./helpers/p2ppairstaking-helper";
import {parseEther} from "ethers/lib/utils";
import {almostEqual} from "./helpers/uniswapv3-helper";

describe("P2P Pair Staking Test", () => {
  let testEnv: TestEnv;
  let p2pPairStaking: P2PPairStaking;
  let cApe: AutoCompoundApe;
  let MINIMUM_LIQUIDITY;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {ape, users, apeCoinStaking} = testEnv;

    const user1 = users[0];
    const user4 = users[5];

    p2pPairStaking = await getP2PPairStaking();

    cApe = await getAutoCompoundApe();
    MINIMUM_LIQUIDITY = await cApe.MINIMUM_LIQUIDITY();

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

    return testEnv;
  };

  it("test BAYC pair with ApeCoin Staking", async () => {
    const {
      users: [user1, user2],
      ape,
      bayc,
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "1", user1);
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

    expect(await bayc.balanceOf(user1.address)).to.be.equal(1);
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
    } = await loadFixture(fixture);

    await mintAndValidate(mayc, "1", user1);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await mayc
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
      1,
      mayc,
      0,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      1,
      ape,
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

    expect(await mayc.balanceOf(user1.address)).to.be.equal(1);
    expect(await ape.balanceOf(user2.address)).to.be.equal(
      parseEther("1000000")
    );
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
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "1", user1);
    await mintAndValidate(bakc, "1", user2);
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

    const txReceipt = await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .matchBAKCPairStakingList(
          user1SignedOrder,
          user2SignedOrder,
          user3SignedOrder
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
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user3.address),
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
    almostEqual(await cApe.balanceOf(user2.address), parseEther("720"));
    almostEqual(await cApe.balanceOf(user3.address), parseEther("2160"));

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await p2pPairStaking.connect(user1.signer).breakUpMatchedOrder(orderHash)
    );

    expect(await bayc.balanceOf(user1.address)).to.be.equal(1);
    expect(await bakc.balanceOf(user2.address)).to.be.equal(1);
    expect(await ape.balanceOf(user3.address)).to.be.equal(
      parseEther("1000000")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user3.address),
      parseEther("2160")
    );
  });

  it("test MAYC pair with BAKC and ApeCoin Staking", async () => {
    const {
      users: [user1, user2, user3],
      ape,
      mayc,
      bakc,
    } = await loadFixture(fixture);

    await mintAndValidate(mayc, "1", user1);
    await mintAndValidate(bakc, "1", user2);
    await mintAndValidate(ape, "1000000", user3);

    await waitForTx(
      await mayc
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
      3,
      mayc,
      0,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      3,
      bakc,
      0,
      2000,
      user2
    );
    const user3SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      3,
      ape,
      0,
      6000,
      user3
    );

    const txReceipt = await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .matchBAKCPairStakingList(
          user1SignedOrder,
          user2SignedOrder,
          user3SignedOrder
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
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user3.address),
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
    almostEqual(await cApe.balanceOf(user2.address), parseEther("720"));
    almostEqual(await cApe.balanceOf(user3.address), parseEther("2160"));

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await p2pPairStaking.connect(user1.signer).breakUpMatchedOrder(orderHash)
    );

    expect(await mayc.balanceOf(user1.address)).to.be.equal(1);
    expect(await bakc.balanceOf(user2.address)).to.be.equal(1);
    expect(await ape.balanceOf(user3.address)).to.be.equal(
      parseEther("1000000")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user3.address),
      parseEther("2160")
    );
  });

  it("match failed when order was canceled 0", async () => {
    const {
      users: [user1, user2],
      ape,
      bayc,
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "1", user1);
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

    await mintAndValidate(bayc, "1", user1);
    await mintAndValidate(bakc, "1", user2);
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
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "1", user1);
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
      1,
      ape,
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
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "1", user1);
    await mintAndValidate(bakc, "1", user2);
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
      1,
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

    await expect(
      p2pPairStaking
        .connect(user1.signer)
        .matchBAKCPairStakingList(
          user1SignedOrder,
          user2SignedOrder,
          user3SignedOrder
        )
    ).to.be.revertedWith("orders type match failed");
  });

  it("match failed when share match failed 0", async () => {
    const {
      users: [user1, user2],
      ape,
      bayc,
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "1", user1);
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
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "1", user1);
    await mintAndValidate(bakc, "1", user2);
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
      7000,
      user3
    );

    await expect(
      p2pPairStaking
        .connect(user1.signer)
        .matchBAKCPairStakingList(
          user1SignedOrder,
          user2SignedOrder,
          user3SignedOrder
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
      ape,
    } = await loadFixture(fixture);

    await expect(
      p2pPairStaking.connect(user2.signer).setMatchingOperator(user5.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await waitForTx(
      await p2pPairStaking
        .connect(gatewayAdmin.signer)
        .setMatchingOperator(user5.address)
    );

    await mintAndValidate(bayc, "1", user2);
    await mintAndValidate(ape, "1000000", user3);

    await waitForTx(
      await bayc
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
      0,
      bayc,
      0,
      2000,
      user2
    );
    user1SignedOrder.v = 0;
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      ape,
      0,
      8000,
      user3
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

    expect(await bayc.balanceOf(user2.address)).to.be.equal(1);
    expect(await ape.balanceOf(user3.address)).to.be.equal(
      parseEther("1000000")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("720")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user3.address),
      parseEther("2880")
    );
  });

  it("compound fee work as expected", async () => {
    const {
      users: [user1, user2, user3],
      gatewayAdmin,
      bayc,
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await p2pPairStaking.connect(gatewayAdmin.signer).setCompoundFee(50)
    );

    await mintAndValidate(bayc, "1", user2);
    await mintAndValidate(ape, "1000000", user3);

    await waitForTx(
      await bayc
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
      0,
      bayc,
      0,
      2000,
      user2
    );
    const user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      ape,
      0,
      8000,
      user3
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
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("716.4")
    );
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user3.address),
      parseEther("2865.6")
    );

    await waitForTx(
      await p2pPairStaking
        .connect(gatewayAdmin.signer)
        .claimCompoundFee(gatewayAdmin.address)
    );

    almostEqual(await cApe.balanceOf(gatewayAdmin.address), parseEther("18"));
  });
});
