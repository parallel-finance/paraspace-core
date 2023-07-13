import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {AutoCompoundApe, ParaApeStaking} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate, supplyAndValidate} from "./helpers/validated-steps";
import {
  getAutoCompoundApe,
  getInitializableAdminUpgradeabilityProxy,
  getParaApeStaking,
} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {getSignedListingOrder} from "./helpers/p2ppairstaking-helper";
import {parseEther} from "ethers/lib/utils";
import {almostEqual} from "./helpers/uniswapv3-helper";
import {deployParaApeStakingImpl} from "../helpers/contracts-deployments";
import {GLOBAL_OVERRIDES} from "../helpers/hardhat-constants";
import {ProtocolErrors} from "../helpers/types";

describe("P2P Pair Staking Test", () => {
  let testEnv: TestEnv;
  let paraApeStaking: ParaApeStaking;
  let cApe: AutoCompoundApe;
  let MINIMUM_LIQUIDITY;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      users: [user1, user2, , user4, user5, user6],
      apeCoinStaking,
      poolAdmin,
    } = testEnv;

    //upgrade to non-fake implementation
    const paraApeStakingImpl = await deployParaApeStakingImpl(false);
    paraApeStaking = await getParaApeStaking();
    const paraApeStakingProxy = await getInitializableAdminUpgradeabilityProxy(
      paraApeStaking.address
    );
    await waitForTx(
      await paraApeStakingProxy
        .connect(user5.signer)
        .upgradeTo(paraApeStakingImpl.address, GLOBAL_OVERRIDES)
    );
    await waitForTx(
      await paraApeStaking
        .connect(poolAdmin.signer)
        .setApeStakingBot(user4.address)
    );

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
    await mintAndValidate(ape, "1", user6);
    await waitForTx(
      await ape.connect(user6.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe.connect(user6.signer).deposit(user6.address, MINIMUM_LIQUIDITY)
    );

    await waitForTx(
      await ape.connect(user2.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe
        .connect(user2.signer)
        .approve(paraApeStaking.address, MAX_UINT_AMOUNT)
    );

    return testEnv;
  };

  it("test BAYC pair with ApeCoin Staking", async () => {
    const {
      users: [user1, user2],
      ape,
      bayc,
      nBAYC,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await mintAndValidate(ape, "1000000", user2);

    const apeAmount = await paraApeStaking.getApeCoinStakingCap(0);
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );

    const user1SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      0,
      bayc,
      0,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      0,
      cApe,
      0,
      8000,
      user2
    );

    const txReceipt = await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    );
    const logLength = txReceipt.logs.length;
    const orderHash = txReceipt.logs[logLength - 1].data;

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .claimForMatchedOrderAndCompound([orderHash])
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user2.address),
      parseEther("2880")
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).claimCApeReward(user1.address)
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).claimCApeReward(user2.address)
    );

    almostEqual(await cApe.balanceOf(user1.address), parseEther("720"));
    almostEqual(await cApe.balanceOf(user2.address), parseEther("2880"));
    await waitForTx(
      await cApe
        .connect(user2.signer)
        .transfer(user1.address, await cApe.balanceOf(user2.address))
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking.connect(user1.signer).breakUpMatchedOrder(orderHash)
    );

    expect(await bayc.balanceOf(nBAYC.address)).to.be.equal(1);
    almostEqual(await cApe.balanceOf(user2.address), apeAmount);
    almostEqual(
      await paraApeStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user2.address),
      parseEther("2880")
    );
  });

  it("test MAYC pair with ApeCoin Staking", async () => {
    const {
      users: [user1, user2],
      ape,
      mayc,
      nMAYC,
    } = await loadFixture(fixture);

    await supplyAndValidate(mayc, "1", user1, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await mayc
        .connect(user1.signer)
        .setApprovalForAll(paraApeStaking.address, true)
    );

    const apeAmount = await paraApeStaking.getApeCoinStakingCap(1);
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );

    const user1SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      1,
      mayc,
      0,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      1,
      cApe,
      0,
      8000,
      user2
    );

    const txReceipt = await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    );
    const logLength = txReceipt.logs.length;
    const orderHash = txReceipt.logs[logLength - 1].data;

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .claimForMatchedOrderAndCompound([orderHash])
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user2.address),
      parseEther("2880")
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).claimCApeReward(user1.address)
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).claimCApeReward(user2.address)
    );

    almostEqual(await cApe.balanceOf(user1.address), parseEther("720"));
    almostEqual(await cApe.balanceOf(user2.address), parseEther("2880"));
    await waitForTx(
      await cApe
        .connect(user2.signer)
        .transfer(user1.address, await cApe.balanceOf(user2.address))
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking.connect(user1.signer).breakUpMatchedOrder(orderHash)
    );

    expect(await mayc.balanceOf(nMAYC.address)).to.be.equal(1);
    almostEqual(await cApe.balanceOf(user2.address), apeAmount);
    almostEqual(
      await paraApeStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user2.address),
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
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user3, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(paraApeStaking.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user3.signer)
        .setApprovalForAll(paraApeStaking.address, true)
    );

    const apeAmount = await paraApeStaking.getApeCoinStakingCap(2);
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );

    const user1SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      bayc,
      0,
      2000,
      user1
    );
    const user3SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      bakc,
      0,
      2000,
      user3
    );
    const user2SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      cApe,
      0,
      6000,
      user2
    );

    const txReceipt = await waitForTx(
      await paraApeStaking
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
      await paraApeStaking
        .connect(user1.signer)
        .claimForMatchedOrderAndCompound([orderHash])
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user3.address),
      parseEther("720")
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user2.address),
      parseEther("2160")
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).claimCApeReward(user1.address)
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).claimCApeReward(user2.address)
    );
    await waitForTx(
      await paraApeStaking.connect(user3.signer).claimCApeReward(user3.address)
    );

    almostEqual(await cApe.balanceOf(user1.address), parseEther("720"));
    almostEqual(await cApe.balanceOf(user3.address), parseEther("720"));
    almostEqual(await cApe.balanceOf(user2.address), parseEther("2160"));
    await waitForTx(
      await cApe
        .connect(user2.signer)
        .transfer(user1.address, await cApe.balanceOf(user2.address))
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking.connect(user1.signer).breakUpMatchedOrder(orderHash)
    );

    expect(await bayc.balanceOf(nBAYC.address)).to.be.equal(1);
    expect(await bakc.balanceOf(nBAKC.address)).to.be.equal(1);
    almostEqual(await cApe.balanceOf(user2.address), apeAmount);

    almostEqual(
      await paraApeStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user3.address),
      parseEther("720")
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user2.address),
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
    } = await loadFixture(fixture);

    await supplyAndValidate(mayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user3, true);
    await mintAndValidate(ape, "1000000", user2);

    const apeAmount = await paraApeStaking.getApeCoinStakingCap(2);
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );

    const user1SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      mayc,
      0,
      2000,
      user1
    );
    const user3SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      bakc,
      0,
      2000,
      user3
    );
    const user2SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      cApe,
      0,
      6000,
      user2
    );

    const txReceipt = await waitForTx(
      await paraApeStaking
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
      await paraApeStaking
        .connect(user1.signer)
        .claimForMatchedOrderAndCompound([orderHash])
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user3.address),
      parseEther("720")
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user2.address),
      parseEther("2160")
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).claimCApeReward(user1.address)
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).claimCApeReward(user2.address)
    );
    await waitForTx(
      await paraApeStaking.connect(user3.signer).claimCApeReward(user3.address)
    );

    almostEqual(await cApe.balanceOf(user1.address), parseEther("720"));
    almostEqual(await cApe.balanceOf(user3.address), parseEther("720"));
    almostEqual(await cApe.balanceOf(user2.address), parseEther("2160"));
    await waitForTx(
      await cApe
        .connect(user2.signer)
        .transfer(user1.address, await cApe.balanceOf(user2.address))
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking.connect(user1.signer).breakUpMatchedOrder(orderHash)
    );

    expect(await mayc.balanceOf(nMAYC.address)).to.be.equal(1);
    expect(await bakc.balanceOf(nBAKC.address)).to.be.equal(1);
    almostEqual(await cApe.balanceOf(user2.address), apeAmount);
    almostEqual(
      await paraApeStaking.pendingCApeReward(user1.address),
      parseEther("720")
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user3.address),
      parseEther("720")
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user2.address),
      parseEther("2160")
    );
  });

  it("claimForMatchedOrderAndCompound for multi user work as expected", async () => {
    const {
      users: [user1, user2, user3],
      ape,
      bayc,
      bakc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "10", user1, true);
    await supplyAndValidate(bakc, "10", user3, true);
    await mintAndValidate(ape, "10000000", user2);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(paraApeStaking.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user3.signer)
        .setApprovalForAll(paraApeStaking.address, true)
    );
    await waitForTx(
      await cApe
        .connect(user2.signer)
        .deposit(user2.address, parseEther("1000000"))
    );

    const txArray: string[] = [];
    for (let i = 0; i < 10; i++) {
      const user1SignedOrder = await getSignedListingOrder(
        paraApeStaking,
        2,
        bayc,
        i,
        2000,
        user1
      );
      const user3SignedOrder = await getSignedListingOrder(
        paraApeStaking,
        2,
        bakc,
        i,
        2000,
        user3
      );
      const user2SignedOrder = await getSignedListingOrder(
        paraApeStaking,
        2,
        cApe,
        0,
        6000,
        user2
      );

      const txReceipt = await waitForTx(
        await paraApeStaking
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
        await paraApeStaking
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
        .setApprovalForAll(paraApeStaking.address, true)
    );
    await waitForTx(
      await ape
        .connect(user2.signer)
        .approve(paraApeStaking.address, MAX_UINT_AMOUNT)
    );

    const user1SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      0,
      bayc,
      0,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      0,
      ape,
      0,
      8000,
      user2
    );

    await waitForTx(
      await paraApeStaking.connect(user2.signer).cancelListing(user2SignedOrder)
    );

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    ).to.be.revertedWith(ProtocolErrors.ORDER_ALREADY_CANCELLED);
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
        .setApprovalForAll(paraApeStaking.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user2.signer)
        .setApprovalForAll(paraApeStaking.address, true)
    );
    await waitForTx(
      await ape
        .connect(user3.signer)
        .approve(paraApeStaking.address, MAX_UINT_AMOUNT)
    );

    const user1SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      bayc,
      0,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      bakc,
      0,
      2000,
      user2
    );
    const user3SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      ape,
      0,
      6000,
      user3
    );

    await waitForTx(
      await paraApeStaking.connect(user3.signer).cancelListing(user3SignedOrder)
    );

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .matchBAKCPairStakingList(
          user1SignedOrder,
          user2SignedOrder,
          user3SignedOrder
        )
    ).to.be.revertedWith(ProtocolErrors.ORDER_ALREADY_CANCELLED);
  });

  it("match failed when orders type match failed 0", async () => {
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
        .setApprovalForAll(paraApeStaking.address, true)
    );
    const apeAmount = await paraApeStaking.getApeCoinStakingCap(0);
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );

    const user1SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      0,
      bayc,
      0,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      1,
      cApe,
      0,
      8000,
      user2
    );

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    ).to.be.revertedWith(ProtocolErrors.ORDER_TYPE_MATCH_FAILED);
  });

  it("match failed when orders type match failed 1", async () => {
    const {
      users: [user1, user2, user3],
      ape,
      bayc,
      bakc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user3, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(paraApeStaking.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user3.signer)
        .setApprovalForAll(paraApeStaking.address, true)
    );

    const apeAmount = await paraApeStaking.getApeCoinStakingCap(2);
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );

    const user1SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      bayc,
      0,
      2000,
      user1
    );
    const user3SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      1,
      bakc,
      0,
      2000,
      user3
    );
    const user2SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      cApe,
      0,
      6000,
      user2
    );

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .matchBAKCPairStakingList(
          user1SignedOrder,
          user3SignedOrder,
          user2SignedOrder
        )
    ).to.be.revertedWith(ProtocolErrors.ORDER_TYPE_MATCH_FAILED);
  });

  it("match failed when share match failed 0", async () => {
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
        .setApprovalForAll(paraApeStaking.address, true)
    );
    const apeAmount = await paraApeStaking.getApeCoinStakingCap(0);
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );

    const user1SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      0,
      bayc,
      0,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      0,
      cApe,
      0,
      7000,
      user2
    );

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    ).to.be.revertedWith(ProtocolErrors.ORDER_SHARE_MATCH_FAILED);
  });

  it("match failed when share match failed 1", async () => {
    const {
      users: [user1, user2, user3],
      ape,
      bayc,
      bakc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user3, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(paraApeStaking.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user3.signer)
        .setApprovalForAll(paraApeStaking.address, true)
    );

    const apeAmount = await paraApeStaking.getApeCoinStakingCap(2);
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );

    const user1SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      bayc,
      0,
      2000,
      user1
    );
    const user3SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      bakc,
      0,
      2000,
      user3
    );
    const user2SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      cApe,
      0,
      7000,
      user2
    );

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .matchBAKCPairStakingList(
          user1SignedOrder,
          user3SignedOrder,
          user2SignedOrder
        )
    ).to.be.revertedWith(ProtocolErrors.ORDER_SHARE_MATCH_FAILED);
  });

  it("listing order can only be canceled by offerer", async () => {
    const {
      users: [user1, user2],
      bayc,
    } = await loadFixture(fixture);

    const user1SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      0,
      bayc,
      0,
      2000,
      user1
    );

    await expect(
      paraApeStaking.connect(user2.signer).cancelListing(user1SignedOrder)
    ).to.be.revertedWith(ProtocolErrors.NOT_ORDER_OFFERER);

    await waitForTx(
      await paraApeStaking.connect(user1.signer).cancelListing(user1SignedOrder)
    );
  });

  it("compound fee work as expected", async () => {
    const {
      users: [user1, user2, user3, user4],
      bayc,
      ape,
      poolAdmin,
    } = await loadFixture(fixture);

    await waitForTx(
      await paraApeStaking.connect(poolAdmin.signer).setCompoundFee(50)
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
        .setApprovalForAll(paraApeStaking.address, true)
    );
    const apeAmount = await paraApeStaking.getApeCoinStakingCap(0);
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );

    const user1SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      0,
      bayc,
      0,
      2000,
      user3
    );
    const user2SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      0,
      cApe,
      0,
      8000,
      user2
    );

    const txReceipt = await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    );
    const logLength = txReceipt.logs.length;
    const orderHash = txReceipt.logs[logLength - 1].data;

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .claimForMatchedOrderAndCompound([orderHash])
    );

    almostEqual(
      await paraApeStaking.pendingCApeReward(user3.address),
      parseEther("716.4")
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user2.address),
      parseEther("2865.6")
    );

    almostEqual(
      await paraApeStaking.pendingCApeReward(paraApeStaking.address),
      parseEther("18")
    );
  });

  it("check ape token can be matched twice", async () => {
    const {
      users: [user1, user2, user3],
      bayc,
      ape,
      bakc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user3, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(paraApeStaking.address, true)
    );
    await waitForTx(
      await bakc
        .connect(user3.signer)
        .setApprovalForAll(paraApeStaking.address, true)
    );
    await waitForTx(
      await cApe
        .connect(user2.signer)
        .deposit(user2.address, parseEther("500000"))
    );

    //match bayc + ApeCoin
    let user1SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      0,
      bayc,
      0,
      2000,
      user1
    );
    let user2SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      0,
      cApe,
      0,
      8000,
      user2
    );

    let txReceipt = await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    );
    let logLength = txReceipt.logs.length;
    const orderHash0 = txReceipt.logs[logLength - 1].data;

    //match bayc + bakc + ApeCoin
    user1SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      bayc,
      0,
      2000,
      user1
    );
    const user3SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      bakc,
      0,
      2000,
      user3
    );
    user2SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      2,
      cApe,
      0,
      6000,
      user2
    );

    txReceipt = await waitForTx(
      await paraApeStaking
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
      await paraApeStaking.connect(user1.signer).breakUpMatchedOrder(orderHash0)
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).breakUpMatchedOrder(orderHash1)
    );
  });

  it("check ape coin listing order can not be matched twice", async () => {
    const {
      users: [user1, user2],
      bayc,
      ape,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "2", user1, true);
    await mintAndValidate(ape, "1000000", user2);

    await waitForTx(
      await bayc
        .connect(user1.signer)
        .setApprovalForAll(paraApeStaking.address, true)
    );
    await waitForTx(
      await cApe
        .connect(user2.signer)
        .deposit(user2.address, parseEther("500000"))
    );

    const user1SignedOrder0 = await getSignedListingOrder(
      paraApeStaking,
      0,
      bayc,
      0,
      2000,
      user1
    );
    const user1SignedOrder1 = await getSignedListingOrder(
      paraApeStaking,
      0,
      bayc,
      1,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      0,
      cApe,
      0,
      8000,
      user2
    );

    const txReceipt = await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder0, user2SignedOrder)
    );
    const logLength = txReceipt.logs.length;
    const orderHash0 = txReceipt.logs[logLength - 1].data;

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder1, user2SignedOrder)
    ).to.be.revertedWith(ProtocolErrors.ORDER_ALREADY_MATCHED);

    await waitForTx(
      await paraApeStaking.connect(user1.signer).breakUpMatchedOrder(orderHash0)
    );

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder1, user2SignedOrder)
    );
  });

  it("pause work as expected", async () => {
    const {
      users: [user1, user2],
      ape,
      mayc,
      poolAdmin,
    } = await loadFixture(fixture);

    await supplyAndValidate(mayc, "1", user1, true);
    await mintAndValidate(ape, "1000000", user2);

    const apeAmount = await paraApeStaking.getApeCoinStakingCap(1);
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, apeAmount)
    );

    const user1SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      1,
      mayc,
      0,
      2000,
      user1
    );
    const user2SignedOrder = await getSignedListingOrder(
      paraApeStaking,
      1,
      cApe,
      0,
      8000,
      user2
    );

    await expect(
      paraApeStaking.connect(user1.signer).pause()
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_OR_EMERGENCY_ADMIN);

    await waitForTx(await paraApeStaking.connect(poolAdmin.signer).pause());

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    ).to.be.revertedWith("paused");

    await waitForTx(await paraApeStaking.connect(poolAdmin.signer).unpause());

    const txReceipt = await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    );
    const logLength = txReceipt.logs.length;
    const orderHash = txReceipt.logs[logLength - 1].data;

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(await paraApeStaking.connect(poolAdmin.signer).pause());

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .claimForMatchedOrderAndCompound([orderHash])
    ).to.be.revertedWith("paused");

    await waitForTx(await paraApeStaking.connect(poolAdmin.signer).unpause());

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .claimForMatchedOrderAndCompound([orderHash])
    );

    await waitForTx(await paraApeStaking.connect(poolAdmin.signer).pause());

    await expect(
      paraApeStaking.connect(user1.signer).claimCApeReward(user1.address)
    ).to.be.revertedWith("paused");

    await waitForTx(await paraApeStaking.connect(poolAdmin.signer).unpause());

    await waitForTx(
      await paraApeStaking.connect(user1.signer).claimCApeReward(user1.address)
    );
  });
});
