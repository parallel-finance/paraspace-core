import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {AutoCompoundApe, P2PPairStaking, ParaApeStaking} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate, supplyAndValidate} from "./helpers/validated-steps";
import {
  getAutoCompoundApe,
  getInitializableAdminUpgradeabilityProxy,
  getP2PPairStaking,
  getParaApeStaking,
} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {getSignedListingOrder} from "./helpers/p2ppairstaking-helper";
import {parseEther} from "ethers/lib/utils";
import {almostEqual} from "./helpers/uniswapv3-helper";
import {deployParaApeStakingImpl} from "../helpers/contracts-deployments";
import {GLOBAL_OVERRIDES} from "../helpers/hardhat-constants";
import {getEthersSigners} from "../helpers/contracts-helpers";

describe("P2P Pair Staking Migration Test", () => {
  let testEnv: TestEnv;
  let p2pPairStaking: P2PPairStaking;
  let paraApeStaking: ParaApeStaking;
  let cApe: AutoCompoundApe;
  let MINIMUM_LIQUIDITY;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      users: [user1, user2, , , , user6],
      apeCoinStaking,
    } = testEnv;

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
    await mintAndValidate(ape, "1", user6);
    await waitForTx(
      await ape.connect(user6.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe.connect(user6.signer).deposit(user6.address, MINIMUM_LIQUIDITY)
    );

    //user2 deposit free sApe
    await mintAndValidate(ape, "10000000", user2);
    await waitForTx(
      await ape.connect(user2.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe
        .connect(user2.signer)
        .approve(p2pPairStaking.address, MAX_UINT_AMOUNT)
    );

    return testEnv;
  };

  it("test BAYC pair with BAKC and ApeCoin Staking", async () => {
    const {
      users: [user1, user2, user3],
      bayc,
      mayc,
      bakc,
      nBAYC,
      nMAYC,
      nBAKC,
      poolAdmin,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(mayc, "1", user1, true);
    await supplyAndValidate(bakc, "2", user3, true);

    //bayc staking
    const baycApeAmount = await p2pPairStaking.getApeCoinStakingCap(0);
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, baycApeAmount)
    );

    let user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      bayc.address,
      0,
      2000,
      user1
    );
    let user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      0,
      cApe.address,
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
    const tx0OrderHash = txReceipt.logs[logLength - 1].data;

    //mayc staking
    const maycApeAmount = await p2pPairStaking.getApeCoinStakingCap(1);
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, maycApeAmount)
    );

    user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      1,
      mayc.address,
      0,
      2000,
      user1
    );
    user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      1,
      cApe.address,
      0,
      8000,
      user2
    );

    txReceipt = await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .matchPairStakingList(user1SignedOrder, user2SignedOrder)
    );
    logLength = txReceipt.logs.length;
    const tx1OrderHash = txReceipt.logs[logLength - 1].data;

    //bayc + bakc pair staking
    const pairApeAmount = await p2pPairStaking.getApeCoinStakingCap(2);
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, pairApeAmount)
    );

    user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      bayc.address,
      0,
      2000,
      user1
    );
    let user3SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      bakc.address,
      0,
      2000,
      user3
    );
    user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      cApe.address,
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
    const tx2OrderHash = txReceipt.logs[logLength - 1].data;

    //mayc + bakc pair staking
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, pairApeAmount)
    );

    user1SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      mayc.address,
      0,
      2000,
      user1
    );
    user3SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      bakc.address,
      1,
      2000,
      user3
    );
    user2SignedOrder = await getSignedListingOrder(
      p2pPairStaking,
      2,
      cApe.address,
      1,
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
    const tx3OrderHash = txReceipt.logs[logLength - 1].data;

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await p2pPairStaking
        .connect(user1.signer)
        .claimForMatchedOrderAndCompound([
          tx0OrderHash,
          tx1OrderHash,
          tx2OrderHash,
          tx3OrderHash,
        ])
    );

    //check status
    expect(await bayc.balanceOf(nBAYC.address)).to.be.equal(0);
    expect(await mayc.balanceOf(nMAYC.address)).to.be.equal(0);
    expect(await bakc.balanceOf(nBAKC.address)).to.be.equal(0);

    let matchedOrder0 = await p2pPairStaking.matchedOrders(tx0OrderHash);
    expect(matchedOrder0.apePrincipleAmount).to.be.equal(baycApeAmount);
    let matchedOrder1 = await p2pPairStaking.matchedOrders(tx1OrderHash);
    expect(matchedOrder1.apePrincipleAmount).to.be.equal(maycApeAmount);
    let matchedOrder2 = await p2pPairStaking.matchedOrders(tx2OrderHash);
    expect(matchedOrder2.apePrincipleAmount).to.be.equal(pairApeAmount);
    let matchedOrder3 = await p2pPairStaking.matchedOrders(tx3OrderHash);
    expect(matchedOrder3.apePrincipleAmount).to.be.equal(pairApeAmount);

    //720 * 3
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user1.address),
      parseEther("2160")
    );
    //2880*2 + 2160 = 7920
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user2.address),
      parseEther("7920")
    );
    //720
    almostEqual(
      await p2pPairStaking.pendingCApeReward(user3.address),
      parseEther("720")
    );

    //upgrade to ParaApeStaking
    const paraApeStakingImpl = await deployParaApeStakingImpl(false);
    const paraApeStakingProxy = await getInitializableAdminUpgradeabilityProxy(
      p2pPairStaking.address
    );
    await waitForTx(
      await paraApeStakingProxy
        .connect(poolAdmin.signer)
        .upgradeTo(paraApeStakingImpl.address, GLOBAL_OVERRIDES)
    );
    const signers = await getEthersSigners();
    const adminAddress = await signers[5].getAddress();
    await waitForTx(
      await paraApeStakingProxy
        .connect(poolAdmin.signer)
        .changeAdmin(adminAddress, GLOBAL_OVERRIDES)
    );
    paraApeStaking = await getParaApeStaking(p2pPairStaking.address);

    //check new status
    expect(await bayc.balanceOf(nBAYC.address)).to.be.equal(0);
    expect(await mayc.balanceOf(nMAYC.address)).to.be.equal(0);
    expect(await bakc.balanceOf(nBAKC.address)).to.be.equal(0);
    matchedOrder0 = await paraApeStaking.matchedOrders(tx0OrderHash);
    expect(matchedOrder0.apePrincipleAmount).to.be.equal(baycApeAmount);
    matchedOrder1 = await paraApeStaking.matchedOrders(tx1OrderHash);
    expect(matchedOrder1.apePrincipleAmount).to.be.equal(maycApeAmount);
    matchedOrder2 = await paraApeStaking.matchedOrders(tx2OrderHash);
    expect(matchedOrder2.apePrincipleAmount).to.be.equal(pairApeAmount);
    matchedOrder3 = await paraApeStaking.matchedOrders(tx3OrderHash);
    expect(matchedOrder3.apePrincipleAmount).to.be.equal(pairApeAmount);

    expect(await paraApeStaking.paused()).to.be.equal(true);
    expect(await paraApeStaking.stakedSApeBalance(user2.address)).to.be.equal(
      0
    );

    await expect(
      paraApeStaking.connect(user1.signer).initialize()
    ).to.be.revertedWith("Initializable: contract is already initialized");

    await waitForTx(
      await paraApeStaking.connect(poolAdmin.signer).reset_initialize()
    );
    await waitForTx(
      await paraApeStaking
        .connect(poolAdmin.signer)
        .updateP2PSApeBalance([
          tx0OrderHash,
          tx1OrderHash,
          tx2OrderHash,
          tx3OrderHash,
        ])
    );
    await waitForTx(await paraApeStaking.connect(user1.signer).initialize());

    expect(await paraApeStaking.paused()).to.be.equal(false);
    expect(await paraApeStaking.stakedSApeBalance(user2.address)).to.be.equal(
      parseEther("400000")
    );

    almostEqual(
      await paraApeStaking.pendingCApeReward(user1.address),
      parseEther("2160")
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user2.address),
      parseEther("7920")
    );
    almostEqual(
      await paraApeStaking.pendingCApeReward(user3.address),
      parseEther("720")
    );

    //breakup
    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .breakUpMatchedOrder(tx0OrderHash)
    );
    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .breakUpMatchedOrder(tx1OrderHash)
    );
    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .breakUpMatchedOrder(tx2OrderHash)
    );
    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .breakUpMatchedOrder(tx3OrderHash)
    );

    expect(await paraApeStaking.stakedSApeBalance(user2.address)).to.be.equal(
      0
    );

    //check status
    expect(await bayc.balanceOf(nBAYC.address)).to.be.equal(1);
    expect(await mayc.balanceOf(nMAYC.address)).to.be.equal(1);
    expect(await bakc.balanceOf(nBAKC.address)).to.be.equal(2);

    matchedOrder0 = await paraApeStaking.matchedOrders(tx0OrderHash);
    expect(matchedOrder0.apePrincipleAmount).to.be.equal(0);
    matchedOrder1 = await paraApeStaking.matchedOrders(tx1OrderHash);
    expect(matchedOrder1.apePrincipleAmount).to.be.equal(0);
    matchedOrder2 = await paraApeStaking.matchedOrders(tx2OrderHash);
    expect(matchedOrder2.apePrincipleAmount).to.be.equal(0);
    matchedOrder3 = await paraApeStaking.matchedOrders(tx3OrderHash);
    expect(matchedOrder3.apePrincipleAmount).to.be.equal(0);

    //claim cApe reward
    await waitForTx(
      await p2pPairStaking.connect(user1.signer).claimCApeReward(user1.address)
    );
    await waitForTx(
      await p2pPairStaking.connect(user2.signer).claimCApeReward(user2.address)
    );
    await waitForTx(
      await p2pPairStaking.connect(user3.signer).claimCApeReward(user3.address)
    );
    expect(await paraApeStaking.pendingCApeReward(user1.address)).to.be.equal(
      0
    );
    expect(await paraApeStaking.pendingCApeReward(user2.address)).to.be.equal(
      0
    );
    expect(await paraApeStaking.pendingCApeReward(user3.address)).to.be.equal(
      0
    );
  });
});
