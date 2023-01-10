import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {
  AutoCompoundApe,
  P2PPairStaking,
  PToken,
  PTokenSApe,
  VariableDebtToken,
} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate} from "./helpers/validated-steps";
import {
  getAutoCompoundApe,
  getP2PPairStaking,
  getPToken,
  getPTokenSApe,
  getVariableDebtToken,
} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT, ONE_ADDRESS} from "../helpers/constants";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {ethers} from "hardhat";
import {getSignedListingOrder} from "./helpers/p2ppairstaking-helper";
import {ProtocolErrors} from "../helpers/types";
import {parseEther} from "ethers/lib/utils";
import {almostEqual} from "./helpers/uniswapv3-helper";

describe("APE Coin Staking Test", () => {
  let testEnv: TestEnv;
  let p2pPairStaking: P2PPairStaking;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      users: [user1],
      apeCoinStaking,
    } = testEnv;

    p2pPairStaking = await getP2PPairStaking();

    // send extra tokens to the apestaking contract for rewards
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](
          apeCoinStaking.address,
          parseEther("100000000000")
        )
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
    await mintAndValidate(ape, "100000", user2);

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
      await p2pPairStaking.connect(user1.signer).breakUpMatchedOrder(orderHash)
    );

    expect(await bayc.balanceOf(user1.address)).to.be.equal(1);
    almostEqual(await ape.balanceOf(user1.address), parseEther("720"));
    almostEqual(await ape.balanceOf(user2.address), parseEther("102880"));
  });

  it("test MAYC pair with ApeCoin Staking", async () => {
    const {
      users: [user1, user2],
      ape,
      mayc,
    } = await loadFixture(fixture);

    await mintAndValidate(mayc, "1", user1);
    await mintAndValidate(ape, "100000", user2);

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
      await p2pPairStaking.connect(user1.signer).breakUpMatchedOrder(orderHash)
    );

    expect(await mayc.balanceOf(user1.address)).to.be.equal(1);
    almostEqual(await ape.balanceOf(user1.address), parseEther("720"));
    almostEqual(await ape.balanceOf(user2.address), parseEther("102880"));
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
    await mintAndValidate(ape, "100000", user3);

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
      await p2pPairStaking.connect(user1.signer).breakUpMatchedOrder(orderHash)
    );

    expect(await bayc.balanceOf(user1.address)).to.be.equal(1);
    expect(await bakc.balanceOf(user2.address)).to.be.equal(1);
    almostEqual(await ape.balanceOf(user1.address), parseEther("720"));
    almostEqual(await ape.balanceOf(user2.address), parseEther("720"));
    almostEqual(await ape.balanceOf(user3.address), parseEther("102160"));
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
    await mintAndValidate(ape, "100000", user3);

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
      await p2pPairStaking.connect(user1.signer).breakUpMatchedOrder(orderHash)
    );

    expect(await mayc.balanceOf(user1.address)).to.be.equal(1);
    expect(await bakc.balanceOf(user2.address)).to.be.equal(1);
    almostEqual(await ape.balanceOf(user1.address), parseEther("720"));
    almostEqual(await ape.balanceOf(user2.address), parseEther("720"));
    almostEqual(await ape.balanceOf(user3.address), parseEther("102160"));
  });

  it("match failed when order was canceled 0", async () => {
    const {
      users: [user1, user2],
      ape,
      bayc,
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "1", user1);
    await mintAndValidate(ape, "100000", user2);

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
    await mintAndValidate(ape, "100000", user3);

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
    await mintAndValidate(ape, "100000", user2);

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
    await mintAndValidate(ape, "100000", user3);

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
    await mintAndValidate(ape, "100000", user2);

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
    await mintAndValidate(ape, "100000", user3);

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
});
