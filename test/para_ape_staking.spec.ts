import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {AutoCompoundApe, ParaApeStaking, VariableDebtToken} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate, supplyAndValidate} from "./helpers/validated-steps";
import {
  getAutoCompoundApe,
  getParaApeStaking,
  getVariableDebtToken,
} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {parseEther} from "ethers/lib/utils";
import {ProtocolErrors} from "../helpers/types";

describe("Para Ape Staking Test", () => {
  let testEnv: TestEnv;
  let variableDebtCApeCoin: VariableDebtToken;
  let paraApeStaking: ParaApeStaking;
  let cApe: AutoCompoundApe;
  let MINIMUM_LIQUIDITY;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      users: [user1, , , user4, , user6],
      apeCoinStaking,
      pool,
      protocolDataProvider,
      configurator,
      poolAdmin,
    } = testEnv;

    paraApeStaking = await getParaApeStaking();

    await waitForTx(
      await paraApeStaking
        .connect(poolAdmin.signer)
        .setApeStakingBot(user4.address)
    );

    cApe = await getAutoCompoundApe();
    MINIMUM_LIQUIDITY = await cApe.MINIMUM_LIQUIDITY();

    const {variableDebtTokenAddress: variableDebtCApeCoinAddress} =
      await protocolDataProvider.getReserveTokensAddresses(cApe.address);
    variableDebtCApeCoin = await getVariableDebtToken(
      variableDebtCApeCoinAddress
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

    // user6 deposit MINIMUM_LIQUIDITY to make test case easy
    await mintAndValidate(ape, "1", user6);
    await waitForTx(
      await ape.connect(user6.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe.connect(user6.signer).deposit(user6.address, MINIMUM_LIQUIDITY)
    );

    // user4 deposit and supply cApe to MM
    expect(
      await configurator
        .connect(poolAdmin.signer)
        .setSupplyCap(cApe.address, "20000000000")
    );
    await mintAndValidate(ape, "10000000000", user4);
    await waitForTx(
      await ape.connect(user4.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe
        .connect(user4.signer)
        .deposit(user4.address, parseEther("10000000000"))
    );
    await waitForTx(
      await cApe.connect(user4.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await pool
        .connect(user4.signer)
        .supply(cApe.address, parseEther("10000000000"), user4.address, 0)
    );

    return testEnv;
  };

  it("test BAYC + BAKC pool logic", async () => {
    const {
      users: [user1, user2, , user4],
      bayc,
      bakc,
      nBAYC,
      nBAKC,
      poolAdmin,
      apeCoinStaking,
    } = await loadFixture(fixture);

    await waitForTx(
      await paraApeStaking.connect(poolAdmin.signer).setCompoundFee(1000)
    );

    await supplyAndValidate(bayc, "3", user1, true);
    await supplyAndValidate(bakc, "3", user1, true);

    await waitForTx(
      await nBAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 2)
    );
    await waitForTx(
      await nBAKC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 2)
    );

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositPairNFT(user1.address, true, [0, 1], [0, 1])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user2.signer)
        .depositPairNFT(user2.address, true, [2], [2])
    );
    expect(await bayc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect(await bayc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect(await bayc.ownerOf(2)).to.be.equal(paraApeStaking.address);
    expect(await bakc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect(await bakc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect(await bakc.ownerOf(2)).to.be.equal(paraApeStaking.address);

    await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .stakingPairNFT(true, [0, 1, 2], [0, 1, 2])
    );
    expect((await apeCoinStaking.nftPosition(1, 0)).stakedAmount).to.be.eq(
      parseEther("200000")
    );
    expect((await apeCoinStaking.nftPosition(1, 1)).stakedAmount).to.be.eq(
      parseEther("200000")
    );
    expect((await apeCoinStaking.nftPosition(1, 2)).stakedAmount).to.be.eq(
      parseEther("200000")
    );
    expect((await apeCoinStaking.nftPosition(3, 0)).stakedAmount).to.be.eq(
      parseEther("50000")
    );
    expect((await apeCoinStaking.nftPosition(3, 1)).stakedAmount).to.be.eq(
      parseEther("50000")
    );
    expect((await apeCoinStaking.nftPosition(3, 2)).stakedAmount).to.be.eq(
      parseEther("50000")
    );
    expect(
      await variableDebtCApeCoin.balanceOf(paraApeStaking.address)
    ).to.be.closeTo(parseEther("750000"), parseEther("10"));

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .compoundPairNFT(true, [0, 1, 2], [0, 1, 2])
    );
    let compoundFee = await paraApeStaking.pendingCApeReward(
      paraApeStaking.address
    );
    expect(compoundFee).to.be.closeTo(parseEther("720"), parseEther("10"));

    const user1PendingReward = await paraApeStaking.getPendingReward(1, [0, 1]);
    const user2PendingReward = await paraApeStaking.getPendingReward(1, [2]);
    expect(user1PendingReward).to.be.closeTo(
      parseEther("4320"),
      parseEther("50")
    );
    expect(user2PendingReward).to.be.closeTo(
      parseEther("2160"),
      parseEther("50")
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).claimPendingReward(1, [0, 1])
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).claimPendingReward(1, [2])
    );
    let user1Balance = await cApe.balanceOf(user1.address);
    let user2Balance = await cApe.balanceOf(user2.address);
    expect(user1Balance).to.be.closeTo(user1PendingReward, parseEther("1"));
    expect(user2Balance).to.be.closeTo(user2PendingReward, parseEther("1"));
    expect(user1Balance).to.be.closeTo(user2Balance.mul(2), parseEther("10"));

    const newUser1PendingReward = await paraApeStaking.getPendingReward(
      1,
      [0, 1]
    );
    const newUser2PendingReward = await paraApeStaking.getPendingReward(1, [2]);
    expect(newUser1PendingReward).to.be.equal(0);
    expect(newUser2PendingReward).to.be.equal(0);

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .withdrawPairNFT(true, [0, 1], [0, 1])
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).withdrawPairNFT(true, [2], [2])
    );
    expect(await bayc.ownerOf(0)).to.be.equal(nBAYC.address);
    expect(await bayc.ownerOf(1)).to.be.equal(nBAYC.address);
    expect(await bayc.ownerOf(2)).to.be.equal(nBAYC.address);
    expect(await bakc.ownerOf(0)).to.be.equal(nBAKC.address);
    expect(await bakc.ownerOf(1)).to.be.equal(nBAKC.address);
    expect(await bakc.ownerOf(2)).to.be.equal(nBAKC.address);

    //720 + 720 + 2160(user2's reward part) = 3600
    compoundFee = await paraApeStaking.pendingCApeReward(
      paraApeStaking.address
    );
    expect(compoundFee).to.be.closeTo(parseEther("3600"), parseEther("50"));

    await waitForTx(
      await paraApeStaking.connect(user4.signer).claimCompoundFee(user4.address)
    );
    const compoundFeeBalance = await cApe.balanceOf(user4.address);
    expect(compoundFeeBalance).to.be.closeTo(compoundFee, parseEther("1"));
    //withdraw cannot claim pending reward
    user1Balance = await cApe.balanceOf(user1.address);
    user2Balance = await cApe.balanceOf(user2.address);
    expect(user1Balance).to.be.closeTo(user1PendingReward, parseEther("1"));
    //user2 get user1's part
    expect(user2Balance).to.be.closeTo(
      user1PendingReward.add(user2PendingReward),
      parseEther("20")
    );

    expect(
      await variableDebtCApeCoin.balanceOf(paraApeStaking.address)
    ).to.be.equal(0);

    expect(await cApe.balanceOf(paraApeStaking.address)).to.be.closeTo(
      "0",
      parseEther("10")
    );
  });

  it("test MAYC + BAKC pool logic", async () => {
    const {
      users: [user1, user2, , user4],
      mayc,
      bakc,
      nMAYC,
      nBAKC,
      apeCoinStaking,
      poolAdmin,
    } = await loadFixture(fixture);

    await waitForTx(
      await paraApeStaking.connect(poolAdmin.signer).setCompoundFee(1000)
    );

    await supplyAndValidate(mayc, "3", user1, true);
    await supplyAndValidate(bakc, "3", user1, true);

    await waitForTx(
      await nMAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 2)
    );
    await waitForTx(
      await nBAKC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 2)
    );

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositPairNFT(user1.address, false, [0, 1], [0, 1])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user2.signer)
        .depositPairNFT(user2.address, false, [2], [2])
    );
    expect(await mayc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect(await mayc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect(await mayc.ownerOf(2)).to.be.equal(paraApeStaking.address);
    expect(await bakc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect(await bakc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect(await bakc.ownerOf(2)).to.be.equal(paraApeStaking.address);

    await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .stakingPairNFT(false, [0, 1, 2], [0, 1, 2])
    );
    expect((await apeCoinStaking.nftPosition(2, 0)).stakedAmount).to.be.eq(
      parseEther("100000")
    );
    expect((await apeCoinStaking.nftPosition(2, 1)).stakedAmount).to.be.eq(
      parseEther("100000")
    );
    expect((await apeCoinStaking.nftPosition(2, 2)).stakedAmount).to.be.eq(
      parseEther("100000")
    );
    expect((await apeCoinStaking.nftPosition(3, 0)).stakedAmount).to.be.eq(
      parseEther("50000")
    );
    expect((await apeCoinStaking.nftPosition(3, 1)).stakedAmount).to.be.eq(
      parseEther("50000")
    );
    expect((await apeCoinStaking.nftPosition(3, 2)).stakedAmount).to.be.eq(
      parseEther("50000")
    );
    expect(
      await variableDebtCApeCoin.balanceOf(paraApeStaking.address)
    ).to.be.closeTo(parseEther("450000"), parseEther("10"));

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .compoundPairNFT(false, [0, 1, 2], [0, 1, 2])
    );
    let compoundFee = await paraApeStaking.pendingCApeReward(
      paraApeStaking.address
    );
    expect(compoundFee).to.be.closeTo(parseEther("720"), parseEther("10"));

    const user1PendingReward = await paraApeStaking.getPendingReward(2, [0, 1]);
    const user2PendingReward = await paraApeStaking.getPendingReward(2, [2]);
    expect(user1PendingReward).to.be.closeTo(
      parseEther("4320"),
      parseEther("50")
    );
    expect(user2PendingReward).to.be.closeTo(
      parseEther("2160"),
      parseEther("50")
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).claimPendingReward(2, [0, 1])
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).claimPendingReward(2, [2])
    );
    let user1Balance = await cApe.balanceOf(user1.address);
    let user2Balance = await cApe.balanceOf(user2.address);
    expect(user1Balance).to.be.closeTo(user1PendingReward, parseEther("1"));
    expect(user2Balance).to.be.closeTo(user2PendingReward, parseEther("1"));
    expect(user1Balance).to.be.closeTo(user2Balance.mul(2), parseEther("10"));

    const newUser1PendingReward = await paraApeStaking.getPendingReward(
      2,
      [0, 1]
    );
    const newUser2PendingReward = await paraApeStaking.getPendingReward(2, [2]);
    expect(newUser1PendingReward).to.be.equal(0);
    expect(newUser2PendingReward).to.be.equal(0);

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .withdrawPairNFT(false, [0, 1], [0, 1])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user2.signer)
        .withdrawPairNFT(false, [2], [2])
    );
    expect(await mayc.ownerOf(0)).to.be.equal(nMAYC.address);
    expect(await mayc.ownerOf(1)).to.be.equal(nMAYC.address);
    expect(await mayc.ownerOf(2)).to.be.equal(nMAYC.address);
    expect(await bakc.ownerOf(0)).to.be.equal(nBAKC.address);
    expect(await bakc.ownerOf(1)).to.be.equal(nBAKC.address);
    expect(await bakc.ownerOf(2)).to.be.equal(nBAKC.address);

    //720 + 720 + 2160(user2's reward part) = 3600
    compoundFee = await paraApeStaking.pendingCApeReward(
      paraApeStaking.address
    );
    expect(compoundFee).to.be.closeTo(parseEther("3600"), parseEther("50"));

    await waitForTx(
      await paraApeStaking.connect(user4.signer).claimCompoundFee(user4.address)
    );
    const compoundFeeBalance = await cApe.balanceOf(user4.address);
    expect(compoundFeeBalance).to.be.closeTo(compoundFee, parseEther("1"));
    //withdraw cannot claim pending reward
    user1Balance = await cApe.balanceOf(user1.address);
    user2Balance = await cApe.balanceOf(user2.address);
    expect(user1Balance).to.be.closeTo(user1PendingReward, parseEther("1"));
    //user2 get user1's part
    expect(user2Balance).to.be.closeTo(
      user1PendingReward.add(user2PendingReward),
      parseEther("20")
    );

    expect(
      await variableDebtCApeCoin.balanceOf(paraApeStaking.address)
    ).to.be.equal(0);

    expect(await cApe.balanceOf(paraApeStaking.address)).to.be.closeTo(
      "0",
      parseEther("1")
    );
  });

  it("test single pool logic", async () => {
    const {
      users: [user1, user2, user3, user4],
      bayc,
      mayc,
      bakc,
      nBAYC,
      nMAYC,
      nBAKC,
      apeCoinStaking,
      poolAdmin,
    } = await loadFixture(fixture);

    await waitForTx(
      await paraApeStaking.connect(poolAdmin.signer).setCompoundFee(1000)
    );

    await supplyAndValidate(bayc, "3", user1, true);
    await supplyAndValidate(mayc, "3", user2, true);
    await supplyAndValidate(bakc, "3", user3, true);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bayc.address, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user2.signer)
        .depositNFT(user2.address, mayc.address, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user3.signer)
        .depositNFT(user3.address, bakc.address, [0, 1, 2])
    );
    expect(await bayc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect(await bayc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect(await bayc.ownerOf(2)).to.be.equal(paraApeStaking.address);
    expect(await mayc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect(await mayc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect(await mayc.ownerOf(2)).to.be.equal(paraApeStaking.address);
    expect(await bakc.ownerOf(0)).to.be.equal(paraApeStaking.address);
    expect(await bakc.ownerOf(1)).to.be.equal(paraApeStaking.address);
    expect(await bakc.ownerOf(2)).to.be.equal(paraApeStaking.address);

    await waitForTx(
      await paraApeStaking.connect(user4.signer).stakingApe(true, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking.connect(user4.signer).stakingApe(false, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking.connect(user4.signer).stakingBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [2],
        bakcPairMaycTokenIds: [2],
      })
    );
    expect((await apeCoinStaking.nftPosition(1, 0)).stakedAmount).to.be.eq(
      parseEther("200000")
    );
    expect((await apeCoinStaking.nftPosition(1, 1)).stakedAmount).to.be.eq(
      parseEther("200000")
    );
    expect((await apeCoinStaking.nftPosition(1, 2)).stakedAmount).to.be.eq(
      parseEther("200000")
    );
    expect((await apeCoinStaking.nftPosition(2, 0)).stakedAmount).to.be.eq(
      parseEther("100000")
    );
    expect((await apeCoinStaking.nftPosition(2, 1)).stakedAmount).to.be.eq(
      parseEther("100000")
    );
    expect((await apeCoinStaking.nftPosition(2, 2)).stakedAmount).to.be.eq(
      parseEther("100000")
    );
    expect((await apeCoinStaking.nftPosition(3, 0)).stakedAmount).to.be.eq(
      parseEther("50000")
    );
    expect((await apeCoinStaking.nftPosition(3, 1)).stakedAmount).to.be.eq(
      parseEther("50000")
    );
    expect((await apeCoinStaking.nftPosition(3, 2)).stakedAmount).to.be.eq(
      parseEther("50000")
    );
    expect(
      await variableDebtCApeCoin.balanceOf(paraApeStaking.address)
    ).to.be.closeTo(parseEther("1050000"), parseEther("10"));

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking.connect(user4.signer).compoundApe(true, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking.connect(user4.signer).compoundApe(false, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking.connect(user4.signer).compoundBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [2],
        bakcPairMaycTokenIds: [2],
      })
    );
    let compoundFee = await paraApeStaking.pendingCApeReward(
      paraApeStaking.address
    );
    expect(compoundFee).to.be.closeTo(parseEther("1080"), parseEther("10"));

    const user1PendingReward = await paraApeStaking.getPendingReward(
      3,
      [0, 1, 2]
    );
    const user2PendingReward = await paraApeStaking.getPendingReward(
      4,
      [0, 1, 2]
    );
    const user3PendingReward = await paraApeStaking.getPendingReward(
      5,
      [0, 1, 2]
    );
    expect(user1PendingReward).to.be.closeTo(
      parseEther("3240"),
      parseEther("100")
    );
    expect(user2PendingReward).to.be.closeTo(
      parseEther("3240"),
      parseEther("100")
    );
    expect(user3PendingReward).to.be.closeTo(
      parseEther("3240"),
      parseEther("100")
    );

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .claimPendingReward(3, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user2.signer)
        .claimPendingReward(4, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user3.signer)
        .claimPendingReward(5, [0, 1, 2])
    );
    let user1Balance = await cApe.balanceOf(user1.address);
    let user2Balance = await cApe.balanceOf(user2.address);
    let user3Balance = await cApe.balanceOf(user3.address);
    expect(user1Balance).to.be.closeTo(user1PendingReward, parseEther("100"));
    expect(user2Balance).to.be.closeTo(user2PendingReward, parseEther("100"));
    expect(user3Balance).to.be.closeTo(user3PendingReward, parseEther("100"));

    const newUser1PendingReward = await paraApeStaking.getPendingReward(
      3,
      [0, 1, 2]
    );
    const newUser2PendingReward = await paraApeStaking.getPendingReward(
      4,
      [0, 1, 2]
    );
    const newUser3PendingReward = await paraApeStaking.getPendingReward(
      5,
      [0, 1, 2]
    );
    expect(newUser1PendingReward).to.be.equal(0);
    expect(newUser2PendingReward).to.be.equal(0);
    expect(newUser3PendingReward).to.be.equal(0);

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .withdrawNFT(bayc.address, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user2.signer)
        .withdrawNFT(mayc.address, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user3.signer)
        .withdrawNFT(bakc.address, [0, 1, 2])
    );
    expect(await bayc.ownerOf(0)).to.be.equal(nBAYC.address);
    expect(await bayc.ownerOf(1)).to.be.equal(nBAYC.address);
    expect(await bayc.ownerOf(2)).to.be.equal(nBAYC.address);
    expect(await mayc.ownerOf(0)).to.be.equal(nMAYC.address);
    expect(await mayc.ownerOf(1)).to.be.equal(nMAYC.address);
    expect(await mayc.ownerOf(2)).to.be.equal(nMAYC.address);
    expect(await bakc.ownerOf(0)).to.be.equal(nBAKC.address);
    expect(await bakc.ownerOf(1)).to.be.equal(nBAKC.address);
    expect(await bakc.ownerOf(2)).to.be.equal(nBAKC.address);

    //1080 + 1080 + 3240(user1's reward part) + 3240 (user2's reward part)
    compoundFee = await paraApeStaking.pendingCApeReward(
      paraApeStaking.address
    );
    expect(compoundFee).to.be.closeTo(parseEther("8640"), parseEther("100"));

    await waitForTx(
      await paraApeStaking.connect(user4.signer).claimCompoundFee(user4.address)
    );
    const compoundFeeBalance = await cApe.balanceOf(user4.address);
    expect(compoundFeeBalance).to.be.closeTo(compoundFee, parseEther("1"));

    //withdraw cannot claim pending reward
    user1Balance = await cApe.balanceOf(user1.address);
    user2Balance = await cApe.balanceOf(user2.address);
    user3Balance = await cApe.balanceOf(user3.address);
    expect(user1Balance).to.be.closeTo(user1PendingReward, parseEther("1"));
    expect(user2Balance).to.be.closeTo(user2PendingReward, parseEther("1"));
    expect(user3Balance).to.be.closeTo(
      user3PendingReward.mul(2),
      parseEther("10")
    );

    expect(
      await variableDebtCApeCoin.balanceOf(paraApeStaking.address)
    ).to.be.closeTo("0", "10");

    expect(await cApe.balanceOf(paraApeStaking.address)).to.be.closeTo(
      "0",
      parseEther("10")
    );
  });

  it("depositPairNFT revert test", async () => {
    const {
      users: [user1, user2],
      ape,
      bayc,
      bakc,
      apeCoinStaking,
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "3", user1);
    await mintAndValidate(bakc, "3", user1);
    await mintAndValidate(ape, "1000000", user1);

    await waitForTx(
      await ape
        .connect(user1.signer)
        .approve(apeCoinStaking.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await apeCoinStaking
        .connect(user1.signer)
        .depositBAYC([{tokenId: 0, amount: parseEther("10")}])
    );
    await waitForTx(
      await apeCoinStaking
        .connect(user1.signer)
        .depositBAKC(
          [{mainTokenId: 1, bakcTokenId: 1, amount: parseEther("10")}],
          []
        )
    );

    await supplyAndValidate(bayc, "3", user1, false);
    await supplyAndValidate(bakc, "3", user1, false);

    await expect(
      paraApeStaking
        .connect(user2.signer)
        .depositPairNFT(user2.address, true, [0, 1], [0, 1])
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_OWNER);

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .depositPairNFT(user1.address, true, [0], [0])
    ).to.be.revertedWith(ProtocolErrors.APE_POSITION_EXISTED);

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .depositPairNFT(user1.address, true, [2], [1])
    ).to.be.revertedWith(ProtocolErrors.BAKC_POSITION_EXISTED);

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .depositPairNFT(user1.address, true, [1], [0])
    ).to.be.revertedWith(ProtocolErrors.PAIR_POSITION_EXISTED);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositPairNFT(user1.address, true, [2], [2])
    );
  });

  it("stakingPairNFT revert test", async () => {
    const {
      users: [user1, , , user4],
      bayc,
      bakc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "3", user1, true);
    await supplyAndValidate(bakc, "3", user1, true);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositPairNFT(user1.address, true, [0, 1, 2], [0, 1, 2])
    );

    await expect(
      paraApeStaking.connect(user4.signer).stakingPairNFT(true, [1], [0])
    ).to.be.revertedWith(ProtocolErrors.NOT_PAIRED_APE_AND_BAKC);
  });

  it("compoundPairNFT revert test", async () => {
    const {
      users: [user1, , , user4],
      bayc,
      bakc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "3", user1, true);
    await supplyAndValidate(bakc, "3", user1, true);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositPairNFT(user1.address, true, [0, 1, 2], [0, 1, 2])
    );

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .compoundPairNFT(true, [0, 1, 2], [0, 1, 2])
    ).to.be.revertedWith(ProtocolErrors.NOT_APE_STAKING_BOT);

    await expect(
      paraApeStaking.connect(user4.signer).compoundPairNFT(true, [1], [0])
    ).to.be.revertedWith(ProtocolErrors.NOT_PAIRED_APE_AND_BAKC);
  });

  it("claimPairNFT revert test", async () => {
    const {
      users: [user1, user2, , user4],
      bayc,
      bakc,
      nBAYC,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "4", user1, true);
    await supplyAndValidate(bakc, "3", user1, true);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositPairNFT(user1.address, true, [0, 1, 2], [0, 1, 2])
    );

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .stakingPairNFT(true, [0, 1, 2], [0, 1, 2])
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .compoundPairNFT(true, [0, 1, 2], [0, 1, 2])
    );

    await waitForTx(
      await nBAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 2)
    );

    await expect(
      paraApeStaking.connect(user1.signer).claimPendingReward(1, [0, 1, 2])
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_SAME_OWNER);

    await expect(
      paraApeStaking.connect(user1.signer).claimPendingReward(1, [3])
    ).to.be.revertedWith(ProtocolErrors.NFT_NOT_IN_POOL);
  });

  it("withdrawPairNFT revert test", async () => {
    const {
      users: [user1, user2],
      bayc,
      bakc,
      nBAYC,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "3", user1, true);
    await supplyAndValidate(bakc, "3", user1, true);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositPairNFT(user1.address, true, [0, 1, 2], [0, 1, 2])
    );

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .stakingPairNFT(true, [0, 1], [0, 1])
    );

    await waitForTx(
      await nBAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 2)
    );

    await expect(
      paraApeStaking.connect(user1.signer).withdrawPairNFT(true, [0, 1], [1, 0])
    ).to.be.revertedWith(ProtocolErrors.NOT_PAIRED_APE_AND_BAKC);

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .withdrawPairNFT(true, [0, 1, 2], [0, 1, 2])
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_SAME_OWNER);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .withdrawPairNFT(true, [0, 1], [0, 1])
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).withdrawPairNFT(true, [2], [2])
    );
  });

  it("depositNFT revert test", async () => {
    const {
      users: [user1, user2],
      ape,
      bayc,
      bakc,
      apeCoinStaking,
    } = await loadFixture(fixture);

    await mintAndValidate(bayc, "3", user1);
    await mintAndValidate(bakc, "3", user1);
    await mintAndValidate(ape, "1000000", user1);

    await waitForTx(
      await ape
        .connect(user1.signer)
        .approve(apeCoinStaking.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await apeCoinStaking
        .connect(user1.signer)
        .depositBAYC([{tokenId: 0, amount: parseEther("10")}])
    );
    await waitForTx(
      await apeCoinStaking
        .connect(user1.signer)
        .depositBAKC(
          [{mainTokenId: 1, bakcTokenId: 1, amount: parseEther("10")}],
          []
        )
    );

    await supplyAndValidate(bayc, "3", user1, false);
    await supplyAndValidate(bakc, "3", user1, false);

    await expect(
      paraApeStaking
        .connect(user2.signer)
        .depositNFT(user2.address, bayc.address, [0])
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_OWNER);

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bayc.address, [0])
    ).to.be.revertedWith(ProtocolErrors.APE_POSITION_EXISTED);

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bayc.address, [1])
    ).to.be.revertedWith(ProtocolErrors.PAIR_POSITION_EXISTED);

    await expect(
      paraApeStaking
        .connect(user2.signer)
        .depositNFT(user2.address, bakc.address, [0])
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_OWNER);

    await expect(
      paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bakc.address, [1])
    ).to.be.revertedWith(ProtocolErrors.APE_POSITION_EXISTED);
  });

  it("stakingApe revert test", async () => {
    const {
      users: [user1, , , user4],
      bayc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "3", user1, true);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bayc.address, [0, 1])
    );

    await expect(
      paraApeStaking.connect(user4.signer).stakingApe(true, [2])
    ).to.be.revertedWith(ProtocolErrors.NFT_NOT_IN_POOL);

    await waitForTx(
      await paraApeStaking.connect(user1.signer).stakingApe(true, [0, 1])
    );
  });

  it("stakingBAKC revert test", async () => {
    const {
      users: [user1, , , user4],
      bayc,
      bakc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "3", user1, true);
    await supplyAndValidate(bakc, "3", user1, true);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bayc.address, [0, 1])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bakc.address, [0, 1])
    );

    await expect(
      paraApeStaking.connect(user4.signer).stakingBAKC({
        baycTokenIds: [2],
        bakcPairBaycTokenIds: [0],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    ).to.be.revertedWith(ProtocolErrors.NFT_NOT_IN_POOL);

    await expect(
      paraApeStaking.connect(user4.signer).stakingBAKC({
        baycTokenIds: [0],
        bakcPairBaycTokenIds: [2],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    ).to.be.revertedWith(ProtocolErrors.NFT_NOT_IN_POOL);

    await waitForTx(
      await paraApeStaking.connect(user1.signer).stakingBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    );
  });

  it("compoundApe revert test", async () => {
    const {
      users: [user1, , , user4],
      bayc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "3", user1, true);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bayc.address, [0, 1])
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).stakingApe(true, [0, 1])
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await expect(
      paraApeStaking.connect(user4.signer).compoundApe(true, [2])
    ).to.be.revertedWith(ProtocolErrors.NFT_NOT_IN_POOL);

    await waitForTx(
      await paraApeStaking.connect(user4.signer).compoundApe(true, [0, 1])
    );
  });

  it("compoundBAKC revert test", async () => {
    const {
      users: [user1, , , user4],
      bayc,
      bakc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "3", user1, true);
    await supplyAndValidate(bakc, "3", user1, true);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bayc.address, [0, 1])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bakc.address, [0, 1])
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).stakingBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await expect(
      paraApeStaking.connect(user4.signer).compoundBAKC({
        baycTokenIds: [2],
        bakcPairBaycTokenIds: [1],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    ).to.be.reverted;

    await expect(
      paraApeStaking.connect(user4.signer).compoundBAKC({
        baycTokenIds: [1],
        bakcPairBaycTokenIds: [2],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    ).to.be.revertedWith(ProtocolErrors.NFT_NOT_IN_POOL);

    await waitForTx(
      await paraApeStaking.connect(user4.signer).compoundBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    );
  });

  it("claimNFT revert test", async () => {
    const {
      users: [user1, user2, , user4],
      bayc,
      bakc,
      nBAYC,
      nBAKC,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "3", user1, true);
    await supplyAndValidate(bakc, "3", user1, true);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bayc.address, [0, 1])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bakc.address, [0, 1])
    );

    await waitForTx(
      await nBAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 1)
    );
    await waitForTx(
      await nBAKC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 1)
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).stakingApe(true, [0, 1])
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).stakingBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking.connect(user4.signer).compoundApe(true, [0, 1])
    );

    await waitForTx(
      await paraApeStaking.connect(user4.signer).compoundBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    );

    await expect(
      paraApeStaking.connect(user1.signer).claimPendingReward(3, [0, 1])
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_SAME_OWNER);

    await expect(
      paraApeStaking.connect(user1.signer).claimPendingReward(3, [2])
    ).to.be.revertedWith(ProtocolErrors.NFT_NOT_IN_POOL);

    await expect(
      paraApeStaking.connect(user1.signer).claimPendingReward(5, [0, 1])
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_SAME_OWNER);

    await expect(
      paraApeStaking.connect(user1.signer).claimPendingReward(5, [2])
    ).to.be.revertedWith(ProtocolErrors.NFT_NOT_IN_POOL);

    await waitForTx(
      await paraApeStaking.connect(user1.signer).claimPendingReward(3, [0])
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).claimPendingReward(5, [0])
    );

    await waitForTx(
      await paraApeStaking.connect(user2.signer).claimPendingReward(3, [1])
    );

    await waitForTx(
      await paraApeStaking.connect(user2.signer).claimPendingReward(5, [1])
    );
  });

  it("withdrawNFT revert test", async () => {
    const {
      users: [user1, user2],
      bayc,
      bakc,
      nBAYC,
      nBAKC,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "3", user1, true);
    await supplyAndValidate(bakc, "3", user1, true);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bayc.address, [0, 1])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bakc.address, [0, 1])
    );

    await waitForTx(
      await nBAYC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 1)
    );
    await waitForTx(
      await nBAKC
        .connect(user1.signer)
        .transferFrom(user1.address, user2.address, 1)
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).stakingApe(true, [0, 1])
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).stakingBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    );

    await expect(
      paraApeStaking.connect(user1.signer).withdrawNFT(bayc.address, [0, 1])
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_SAME_OWNER);

    await expect(
      paraApeStaking.connect(user1.signer).withdrawNFT(bayc.address, [1])
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_OWNER);

    await expect(
      paraApeStaking.connect(user1.signer).withdrawNFT(bakc.address, [0, 1])
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_SAME_OWNER);

    await expect(
      paraApeStaking.connect(user1.signer).withdrawNFT(bakc.address, [1])
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_OWNER);

    await waitForTx(
      await paraApeStaking.connect(user1.signer).withdrawNFT(bayc.address, [0])
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).withdrawNFT(bakc.address, [0])
    );

    await waitForTx(
      await paraApeStaking.connect(user2.signer).withdrawNFT(bayc.address, [1])
    );

    await waitForTx(
      await paraApeStaking.connect(user2.signer).withdrawNFT(bakc.address, [1])
    );
  });

  it("multicall test", async () => {
    const {
      users: [user1, , , user4],
      bayc,
      mayc,
      bakc,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "4", user1, true);
    await supplyAndValidate(mayc, "4", user1, true);
    await supplyAndValidate(bakc, "4", user1, true);

    let tx0 = paraApeStaking.interface.encodeFunctionData("depositPairNFT", [
      user1.address,
      true,
      [0, 1],
      [0, 1],
    ]);
    let tx1 = paraApeStaking.interface.encodeFunctionData("depositPairNFT", [
      user1.address,
      false,
      [0, 1],
      [2, 3],
    ]);
    let tx2 = paraApeStaking.interface.encodeFunctionData("depositNFT", [
      user1.address,
      bayc.address,
      [2, 3],
    ]);
    let tx3 = paraApeStaking.interface.encodeFunctionData("depositNFT", [
      user1.address,
      mayc.address,
      [2, 3],
    ]);

    await waitForTx(
      await paraApeStaking.connect(user1.signer).multicall([tx0, tx1, tx2, tx3])
    );

    tx0 = paraApeStaking.interface.encodeFunctionData("stakingPairNFT", [
      true,
      [0, 1],
      [0, 1],
    ]);
    tx1 = paraApeStaking.interface.encodeFunctionData("stakingPairNFT", [
      false,
      [0, 1],
      [2, 3],
    ]);
    tx2 = paraApeStaking.interface.encodeFunctionData("stakingApe", [
      true,
      [2, 3],
    ]);
    tx3 = paraApeStaking.interface.encodeFunctionData("stakingApe", [
      false,
      [2, 3],
    ]);

    await waitForTx(
      await paraApeStaking.connect(user1.signer).multicall([tx0, tx1, tx2, tx3])
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .compoundPairNFT(true, [0, 1], [0, 1])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .compoundPairNFT(false, [0, 1], [2, 3])
    );
    await waitForTx(
      await paraApeStaking.connect(user4.signer).compoundApe(true, [2, 3])
    );
    await waitForTx(
      await paraApeStaking.connect(user4.signer).compoundApe(false, [2, 3])
    );

    tx0 = paraApeStaking.interface.encodeFunctionData("claimPendingReward", [
      1,
      [0, 1],
    ]);
    tx1 = paraApeStaking.interface.encodeFunctionData("claimPendingReward", [
      2,
      [0, 1],
    ]);
    tx2 = paraApeStaking.interface.encodeFunctionData("claimPendingReward", [
      3,
      [2, 3],
    ]);
    tx3 = paraApeStaking.interface.encodeFunctionData("claimPendingReward", [
      4,
      [2, 3],
    ]);

    await waitForTx(
      await paraApeStaking.connect(user1.signer).multicall([tx0, tx1, tx2, tx3])
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .withdrawPairNFT(true, [0, 1], [0, 1])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .withdrawPairNFT(false, [0, 1], [2, 3])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .withdrawNFT(bayc.address, [2, 3])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .withdrawNFT(mayc.address, [2, 3])
    );
  });

  it("ape pair staking reward ratio test", async () => {
    const {
      users: [user1, user2, user3, user4],
      bayc,
      mayc,
      bakc,
      poolAdmin,
    } = await loadFixture(fixture);

    await waitForTx(
      await paraApeStaking
        .connect(poolAdmin.signer)
        .setSinglePoolApeRewardRatio(5000)
    );

    await supplyAndValidate(bayc, "2", user1, true);
    await supplyAndValidate(mayc, "2", user2, true);
    await supplyAndValidate(bakc, "4", user3, true);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bayc.address, [0, 1])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user2.signer)
        .depositNFT(user2.address, mayc.address, [0, 1])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user3.signer)
        .depositNFT(user3.address, bakc.address, [0, 1, 2, 3])
    );

    await waitForTx(
      await paraApeStaking.connect(user4.signer).stakingBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [0, 1],
        bakcPairMaycTokenIds: [2, 3],
      })
    );

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking.connect(user4.signer).compoundBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [0, 1],
        bakcPairMaycTokenIds: [2, 3],
      })
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).claimPendingReward(3, [0, 1])
    );
    await waitForTx(
      await paraApeStaking.connect(user2.signer).claimPendingReward(4, [0, 1])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user3.signer)
        .claimPendingReward(5, [0, 1, 2, 3])
    );

    //user1: 3600 * 0.5 * 0.5
    expect(await cApe.balanceOf(user1.address)).to.be.closeTo(
      parseEther("900"),
      parseEther("10")
    );
    //user1: 3600 * 0.5 * 0.5
    expect(await cApe.balanceOf(user2.address)).to.be.closeTo(
      parseEther("900"),
      parseEther("10")
    );
    //user3: 3600 * 0.5
    expect(await cApe.balanceOf(user3.address)).to.be.closeTo(
      parseEther("1800"),
      parseEther("10")
    );

    await advanceTimeAndBlock(parseInt("3600"));

    //user1: 900 + 0
    //user2: 900 + 900
    //user3: 1800 + 900
    //user4: 0 + 0
    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .withdrawNFT(bayc.address, [0, 1])
    );
    //user1: 900 + 0 + 0
    //user2: 900 + 900 + 0
    //user3: 1800 + 900 + 900
    //user4: 0 + 900
    await waitForTx(
      await paraApeStaking
        .connect(user2.signer)
        .withdrawNFT(mayc.address, [0, 1])
    );
    //user1: 900 + 0 + 0 + 0
    //user2: 900 + 900 + 0 + 0
    //user3: 1800 + 900 + 900 + 0
    //user4: 0 + 900 + 0 + 0
    await waitForTx(
      await paraApeStaking
        .connect(user3.signer)
        .withdrawNFT(bakc.address, [0, 1, 2, 3])
    );
    await waitForTx(
      await paraApeStaking.connect(user4.signer).claimCompoundFee(user4.address)
    );

    expect(await cApe.balanceOf(user1.address)).to.be.closeTo(
      parseEther("900"),
      parseEther("10")
    );
    expect(await cApe.balanceOf(user2.address)).to.be.closeTo(
      parseEther("1800"),
      parseEther("30")
    );
    expect(await cApe.balanceOf(user3.address)).to.be.closeTo(
      parseEther("3600"),
      parseEther("50")
    );
    expect(await cApe.balanceOf(user4.address)).to.be.closeTo(
      parseEther("900"),
      parseEther("10")
    );
  });

  it("test bakc single pool logic0", async () => {
    const {
      users: [user1, user2, user3, user4],
      bayc,
      mayc,
      bakc,
      poolAdmin,
    } = await loadFixture(fixture);

    await waitForTx(
      await paraApeStaking
        .connect(poolAdmin.signer)
        .setSinglePoolApeRewardRatio(5000)
    );

    await supplyAndValidate(bayc, "3", user1, true);
    await supplyAndValidate(mayc, "3", user2, true);
    await supplyAndValidate(bakc, "4", user3, true);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bayc.address, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user2.signer)
        .depositNFT(user2.address, mayc.address, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user3.signer)
        .depositNFT(user3.address, bakc.address, [0, 1, 2, 3])
    );

    await waitForTx(
      await paraApeStaking.connect(user4.signer).stakingApe(true, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking.connect(user4.signer).stakingApe(false, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking.connect(user4.signer).stakingBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [0, 1],
        bakcPairMaycTokenIds: [2, 3],
      })
    );
    expect(
      await variableDebtCApeCoin.balanceOf(paraApeStaking.address)
    ).to.be.closeTo(parseEther("1100000"), parseEther("10"));

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking.connect(user4.signer).compoundBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [],
        bakcPairMaycTokenIds: [],
      })
    );
    const user3PendingReward0 = await paraApeStaking.getPendingReward(
      5,
      [0, 1, 2, 3]
    );
    expect(user3PendingReward0).to.be.closeTo(
      parseEther("900"),
      parseEther("10")
    );

    await waitForTx(
      await paraApeStaking.connect(user4.signer).compoundBAKC({
        baycTokenIds: [],
        bakcPairBaycTokenIds: [],
        maycTokenIds: [0, 1],
        bakcPairMaycTokenIds: [2, 3],
      })
    );
    const user3PendingReward1 = await paraApeStaking.getPendingReward(
      5,
      [0, 1, 2, 3]
    );
    expect(user3PendingReward1).to.be.closeTo(
      parseEther("1800"),
      parseEther("10")
    );
    const user1PendingReward = await paraApeStaking.getPendingReward(3, [0, 1]);
    //900 * 2 / 3
    expect(user1PendingReward).to.be.closeTo(
      parseEther("600"),
      parseEther("10")
    );
    const user2PendingReward = await paraApeStaking.getPendingReward(4, [0, 1]);
    //900 * 2 / 3
    expect(user2PendingReward).to.be.closeTo(
      parseEther("600"),
      parseEther("10")
    );
  });

  it("test bakc single pool logic1", async () => {
    const {
      users: [user1, user2, user3, user4],
      bayc,
      mayc,
      bakc,
      poolAdmin,
    } = await loadFixture(fixture);

    await waitForTx(
      await paraApeStaking
        .connect(poolAdmin.signer)
        .setSinglePoolApeRewardRatio(5000)
    );

    await supplyAndValidate(bayc, "3", user1, true);
    await supplyAndValidate(mayc, "3", user2, true);
    await supplyAndValidate(bakc, "4", user3, true);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .depositNFT(user1.address, bayc.address, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user2.signer)
        .depositNFT(user2.address, mayc.address, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking
        .connect(user3.signer)
        .depositNFT(user3.address, bakc.address, [0, 1, 2, 3])
    );

    await waitForTx(
      await paraApeStaking.connect(user4.signer).stakingApe(true, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking.connect(user4.signer).stakingApe(false, [0, 1, 2])
    );
    await waitForTx(
      await paraApeStaking.connect(user4.signer).stakingBAKC({
        baycTokenIds: [0, 1],
        bakcPairBaycTokenIds: [0, 1],
        maycTokenIds: [0, 1],
        bakcPairMaycTokenIds: [2, 3],
      })
    );
    expect(
      await variableDebtCApeCoin.balanceOf(paraApeStaking.address)
    ).to.be.closeTo(parseEther("1100000"), parseEther("10"));

    await advanceTimeAndBlock(parseInt("3600"));

    await waitForTx(
      await paraApeStaking
        .connect(user3.signer)
        .withdrawNFT(bakc.address, [0, 1, 2, 3])
    );
    const user1PendingReward = await paraApeStaking.getPendingReward(3, [0, 1]);
    //900 * 2 / 3
    expect(user1PendingReward).to.be.closeTo(
      parseEther("600"),
      parseEther("10")
    );
    const user2PendingReward = await paraApeStaking.getPendingReward(4, [0, 1]);
    expect(user1PendingReward).to.be.closeTo(
      user2PendingReward,
      parseEther("1")
    );
  });
});